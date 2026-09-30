using System.Text.Json;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;
using Npgsql;
using NpgsqlTypes;

namespace Nexus.DotNetBackend.Services;

public sealed record AiJob(string Id, string Type, IReadOnlyDictionary<string, object?> Evidence, string Status, string TenantId, string CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, IReadOnlyDictionary<string, object?>? Result, double Progress = 0, string? Error = null);
public sealed record CreateAiJobRequest(string Type, IReadOnlyDictionary<string, object?> Evidence);
public sealed record AiWorkerResult(string JobId, string Status, IReadOnlyDictionary<string, object?>? Result, string? Error);

/// <summary>
/// Long-running AI jobs. Persisted in PostgreSQL; dispatched to Python AI workers over
/// NATS JetStream (<c>ai.jobs</c>) when available. Workers may also report back via
/// <c>POST /api/ai/results</c>.
/// </summary>
public sealed class AiGatewayStore
{
    private const string Columns = "id, type, evidence::text, status, tenant_id, created_by, created_at, updated_at, result::text, progress, error";
    private const string Now = "timezone('utc', now())";

    private readonly NpgsqlDataSource _db;
    private readonly RequestContext _requestContext;

    public AiGatewayStore(NpgsqlDataSource db, RequestContext requestContext)
    {
        _db = db;
        _requestContext = requestContext;
    }

    public async Task<AiJob> CreateAsync(CreateAiJobRequest request, CancellationToken cancellationToken = default)
    {
        var id = $"ai_{Guid.NewGuid():N}";
        var tenantId = _requestContext.TenantId;
        AiJob job;
        await using (var connection = await _db.OpenConnectionAsync(cancellationToken))
        await using (var command = new NpgsqlCommand($@"
INSERT INTO ai_jobs (id, tenant_id, type, status, evidence, created_by, created_at, updated_at)
VALUES (@id, @tenant, @type, 'queued', @evidence, @actor, {Now}, {Now})
RETURNING {Columns}", connection))
        {
            command.Parameters.AddWithValue("id", id);
            command.Parameters.AddWithValue("tenant", tenantId);
            command.Parameters.AddWithValue("type", request.Type);
            command.Parameters.Add(new NpgsqlParameter("evidence", NpgsqlDbType.Json) { Value = JsonSerializer.Serialize(request.Evidence ?? new Dictionary<string, object?>()) });
            command.Parameters.AddWithValue("actor", _requestContext.Principal.Subject);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            job = Read(reader);
        }

        // AiJobPublisher sends this persisted row through JetStream. Keeping
        // publication out of the request makes a NATS outage recoverable.
        return job;
    }

    public async Task<IReadOnlyList<AiJob>> PendingForPublishAsync(int limit, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($"SELECT {Columns} FROM ai_jobs WHERE status = 'queued' AND published_at IS NULL ORDER BY created_at LIMIT @limit", connection);
        command.Parameters.AddWithValue("limit", Math.Clamp(limit, 1, 100));
        var jobs = new List<AiJob>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) jobs.Add(Read(reader));
        return jobs;
    }

    public async Task MarkPublishedAsync(string jobId, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($"UPDATE ai_jobs SET published_at = {Now}, updated_at = {Now} WHERE id = @id AND published_at IS NULL", connection);
        command.Parameters.AddWithValue("id", jobId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task MarkPublishAttemptAsync(string jobId, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($"UPDATE ai_jobs SET publish_attempts = publish_attempts + 1, updated_at = {Now} WHERE id = @id", connection);
        command.Parameters.AddWithValue("id", jobId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public static object WorkerMessage(AiJob job) => new Dictionary<string, object?>
    {
        ["id"] = job.Id,
        ["tenantId"] = job.TenantId,
        ["type"] = job.Type,
        ["evidence"] = job.Evidence,
        ["policy"] = new Dictionary<string, object?> { ["allow_workflow_mutation"] = false, ["require_human_approval"] = true },
    };

    public async Task<IReadOnlyList<AiJob>> ListAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($"SELECT {Columns} FROM ai_jobs WHERE tenant_id = @tenant ORDER BY created_at DESC LIMIT 500", connection);
        command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
        var jobs = new List<AiJob>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) jobs.Add(Read(reader));
        return jobs;
    }

    public async Task<AiJob?> GetAsync(string id, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($"SELECT {Columns} FROM ai_jobs WHERE id = @id AND tenant_id = @tenant", connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? Read(reader) : null;
    }

    public async Task<AiJob?> IngestAsync(AiWorkerResult result, CancellationToken cancellationToken = default)
    {
        var status = string.IsNullOrWhiteSpace(result.Status) ? (result.Error is null ? "completed" : "failed") : result.Status;
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($@"
UPDATE ai_jobs SET status = @status, result = @result, error = @error, progress = 1, updated_at = {Now}
WHERE id = @id RETURNING {Columns}", connection);
        command.Parameters.AddWithValue("id", result.JobId);
        command.Parameters.AddWithValue("status", status);
        command.Parameters.Add(new NpgsqlParameter("result", NpgsqlDbType.Json) { Value = result.Result is null ? DBNull.Value : JsonSerializer.Serialize(result.Result) });
        command.Parameters.AddWithValue("error", (object?)result.Error ?? DBNull.Value);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? Read(reader) : null;
    }

    public async Task RecordProgressAsync(string jobId, double progress, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($@"
UPDATE ai_jobs SET progress = GREATEST(progress, @progress), updated_at = {Now},
    status = CASE WHEN status = 'queued' THEN 'running' ELSE status END
WHERE id = @id AND status IN ('queued', 'running')", connection);
        command.Parameters.AddWithValue("id", jobId);
        command.Parameters.AddWithValue("progress", Math.Clamp(progress, 0, 1));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static AiJob Read(NpgsqlDataReader reader) => new(
        reader.GetString(0),
        reader.GetString(1),
        JsonSerializer.Deserialize<Dictionary<string, object?>>(reader.GetString(2)) ?? new Dictionary<string, object?>(),
        reader.GetString(3),
        reader.GetString(4),
        reader.GetString(5),
        new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(6), DateTimeKind.Utc)),
        new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(7), DateTimeKind.Utc)),
        reader.IsDBNull(8) ? null : JsonSerializer.Deserialize<Dictionary<string, object?>>(reader.GetString(8)),
        reader.GetDouble(9),
        reader.IsDBNull(10) ? null : reader.GetString(10));
}

/// <summary>Durable JetStream consumers for AI worker results and progress.</summary>
public sealed class AiResultConsumer : BackgroundService
{
    private readonly IMessageBus _bus;
    private readonly AiGatewayStore _store;
    private readonly ILogger<AiResultConsumer> _logger;

    public AiResultConsumer(IMessageBus bus, AiGatewayStore store, ILogger<AiResultConsumer> logger)
    {
        _bus = bus;
        _store = store;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var jetStream = _bus.JetStream;
            if (jetStream is null)
            {
                if (_bus.State == "not_configured") return;
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                continue;
            }

            try
            {
                await Task.WhenAll(
                    ConsumeAsync(jetStream, "control-plane-ai-results", "ai.results", HandleResultAsync, stoppingToken),
                    ConsumeAsync(jetStream, "control-plane-ai-progress", "ai.progress", HandleProgressAsync, stoppingToken));
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                _logger.LogWarning(exception, "AI result consumer stopped; retrying");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    private async Task ConsumeAsync(NatsJSContext jetStream, string durable, string subject, Func<JsonElement, CancellationToken, Task> handler, CancellationToken cancellationToken)
    {
        var consumer = await jetStream.CreateOrUpdateConsumerAsync(NatsMessageBus.AiStream, new ConsumerConfig(durable)
        {
            FilterSubject = subject,
            AckPolicy = ConsumerConfigAckPolicy.Explicit,
            DeliverPolicy = ConsumerConfigDeliverPolicy.All,
        }, cancellationToken);

        await foreach (var message in consumer.ConsumeAsync<byte[]>(cancellationToken: cancellationToken))
        {
            try
            {
                if (message.Data is { Length: > 0 } data)
                {
                    using var document = JsonDocument.Parse(data);
                    await handler(document.RootElement, cancellationToken);
                }
                await message.AckAsync(cancellationToken: cancellationToken);
            }
            catch (JsonException)
            {
                _logger.LogWarning("Discarding non-JSON message on {Subject}", subject);
                await message.AckAsync(cancellationToken: cancellationToken);
            }
        }
    }

    private async Task HandleResultAsync(JsonElement payload, CancellationToken cancellationToken)
    {
        var jobId = payload.TryGetProperty("jobId", out var id) ? id.GetString() : null;
        if (string.IsNullOrWhiteSpace(jobId)) return;
        var status = payload.TryGetProperty("status", out var statusElement) ? statusElement.GetString() ?? "completed" : "completed";
        var result = JsonSerializer.Deserialize<Dictionary<string, object?>>(payload.GetRawText());
        var error = status == "failed" && payload.TryGetProperty("summary", out var summary) ? summary.GetString() : null;
        await _store.IngestAsync(new AiWorkerResult(jobId, status, result, error), cancellationToken);
    }

    private async Task HandleProgressAsync(JsonElement payload, CancellationToken cancellationToken)
    {
        var jobId = payload.TryGetProperty("jobId", out var id) ? id.GetString() : null;
        if (string.IsNullOrWhiteSpace(jobId)) return;
        var progress = payload.TryGetProperty("progress", out var value) && value.TryGetDouble(out var parsed) ? parsed : 0;
        await _store.RecordProgressAsync(jobId, progress, cancellationToken);
    }
}

/// <summary>Publishes persisted AI jobs until JetStream accepts them.</summary>
public sealed class AiJobPublisher : BackgroundService
{
    private readonly IMessageBus _bus;
    private readonly AiGatewayStore _store;
    private readonly ILogger<AiJobPublisher> _logger;

    public AiJobPublisher(IMessageBus bus, AiGatewayStore store, ILogger<AiJobPublisher> logger)
    {
        _bus = bus;
        _store = store;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (_bus.State == "connected")
                {
                    foreach (var job in await _store.PendingForPublishAsync(100, stoppingToken))
                    {
                        await _store.MarkPublishAttemptAsync(job.Id, stoppingToken);
                        if (!await _bus.PublishAsync("ai.jobs", AiGatewayStore.WorkerMessage(job), stoppingToken))
                        {
                            _logger.LogWarning("AI job {JobId} remains queued because NATS publish failed", job.Id);
                            break;
                        }
                        await _store.MarkPublishedAsync(job.Id, stoppingToken);
                    }
                }
                await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                _logger.LogWarning(exception, "AI job publisher retry failed");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }
}
