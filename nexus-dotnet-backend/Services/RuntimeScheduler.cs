using System.Text.Json;
using System.Text.Json.Nodes;
using Nexus.DotNetBackend.Contracts;
using Npgsql;
using NpgsqlTypes;

namespace Nexus.DotNetBackend.Services;

/// <summary>
/// PostgreSQL-backed runtime-agent registry, execution queue, leases and agent
/// commands. This is the single source of truth for runtime agents; Python
/// workers register, heartbeat and receive work through it.
/// </summary>
public sealed class RuntimeScheduler
{
    private const long DispatchLockKey = 7300101;
    private const string NoAgentReason = "No compatible runtime agent is currently available.";
    private const string Now = "timezone('utc', now())";
    private const string AgentColumns = "id, tenant_id, name, status, agent_type, endpoint, version, capabilities::text, labels::text, max_concurrency, active_leases, last_heartbeat_at, registered_at";
    private const string QueueColumns = "id, tenant_id, execution_id, status, platform, priority, required_capabilities::text, assigned_agent_id, dispatch_reason, queued_at, dispatched_at, started_at, completed_at";
    private const string LeaseColumns = "l.id, l.execution_id, l.agent_id, l.status, l.platform, l.acquired_at, l.released_at, l.heartbeat_at, l.metadata::text";
    private const string CommandColumns = "id, agent_id, execution_id, lease_id, type, payload::text, status, attempts, created_at";

    private readonly NpgsqlDataSource _db;
    private readonly RequestContext _requestContext;
    private readonly IMessageBus _bus;
    private readonly ILogger<RuntimeScheduler> _logger;

    public RuntimeScheduler(NpgsqlDataSource db, RequestContext requestContext, IMessageBus bus, IConfiguration configuration, ILogger<RuntimeScheduler> logger)
    {
        _db = db;
        _requestContext = requestContext;
        _bus = bus;
        _logger = logger;
        AgentTtl = TimeSpan.FromSeconds(configuration.GetValue("Runtime:AgentTtlSeconds", 45));
        CommandRedeliveryAfter = TimeSpan.FromSeconds(configuration.GetValue("Runtime:CommandRedeliverySeconds", 60));
        MaxCommandAttempts = configuration.GetValue("Runtime:MaxCommandAttempts", 5);
    }

    public TimeSpan AgentTtl { get; }
    public TimeSpan CommandRedeliveryAfter { get; }
    public int MaxCommandAttempts { get; }

    // ── Agents ────────────────────────────────────────────────────────────────

    public async Task<RuntimeAgentView> RegisterAsync(RuntimeAgentRegistration registration, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(registration.Name)) throw new ArgumentException("name is required");
        var agentId = string.IsNullOrWhiteSpace(registration.Id) ? Guid.NewGuid().ToString() : registration.Id.Trim();
        if (agentId.Length > 36) throw new ArgumentException("id must be at most 36 characters");
        var tenantId = _requestContext.TenantId;
        var capabilities = NormalizeCapabilities((registration.Capabilities ?? []).Concat(registration.Platforms ?? []));

        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await AcquireDispatchLockAsync(connection, transaction, cancellationToken);

        // A registration starts a new worker session: anything the previous session held is gone.
        var lost = await ExpireAgentLeasesAsync(connection, transaction, agentId, "runtime agent re-registered", cancellationToken, tenantId);

        RuntimeAgentView agent;
        await using (var command = new NpgsqlCommand($@"
INSERT INTO runtime_agents (id, tenant_id, name, status, agent_type, endpoint, version, capabilities, labels, max_concurrency, active_leases, last_heartbeat_at, registered_at, updated_at)
VALUES (@id, @tenant, @name, 'idle', @type, @endpoint, @version, @capabilities, @labels, @max, 0, {Now}, {Now}, {Now})
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id, name = EXCLUDED.name, status = 'idle', agent_type = EXCLUDED.agent_type,
    endpoint = EXCLUDED.endpoint, version = EXCLUDED.version, capabilities = EXCLUDED.capabilities,
    labels = EXCLUDED.labels, max_concurrency = EXCLUDED.max_concurrency, active_leases = 0,
    last_heartbeat_at = EXCLUDED.last_heartbeat_at, updated_at = EXCLUDED.updated_at
RETURNING {AgentColumns}", connection, transaction))
        {
            command.Parameters.AddWithValue("id", agentId);
            command.Parameters.AddWithValue("tenant", tenantId);
            command.Parameters.AddWithValue("name", registration.Name.Trim());
            command.Parameters.AddWithValue("type", string.IsNullOrWhiteSpace(registration.AgentType) ? "generic" : registration.AgentType.Trim());
            command.Parameters.AddWithValue("endpoint", (object?)registration.Endpoint ?? DBNull.Value);
            command.Parameters.AddWithValue("version", string.IsNullOrWhiteSpace(registration.Version) ? "1.0.0" : registration.Version.Trim());
            command.Parameters.Add(Json("capabilities", capabilities));
            command.Parameters.Add(Json("labels", registration.Labels ?? new Dictionary<string, object?>()));
            command.Parameters.AddWithValue("max", Math.Max(1, registration.MaxConcurrency ?? 1));
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            agent = ReadAgent(reader);
        }

        await AuditAsync(connection, transaction, tenantId, _requestContext.Principal.Subject, "runtime.agent.register", "runtime_agent", agentId,
            new { agent.Name, agent.AgentType, agent.Capabilities, agent.MaxConcurrency }, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        await PublishLostExecutionsAsync(agentId, lost, cancellationToken);
        await PublishEventAsync("agent.registered", tenantId, agentId, null, agent, cancellationToken);
        await ScheduleQueuedAsync(cancellationToken);
        return await GetAgentAsync(agentId, cancellationToken) ?? agent;
    }

    public async Task<RuntimeAgentView?> HeartbeatAsync(string agentId, RuntimeAgentHeartbeat? heartbeat, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        RuntimeAgentView? agent = null;
        string? previousStatus = null;
        await using (var command = new NpgsqlCommand($@"
WITH previous AS (SELECT status FROM runtime_agents WHERE id = @id)
UPDATE runtime_agents SET
    last_heartbeat_at = {Now}, updated_at = {Now},
    status = CASE WHEN @status = 'draining' THEN 'draining'
                  WHEN active_leases >= max_concurrency THEN 'busy'
                  ELSE 'idle' END,
    capabilities = COALESCE(@capabilities, capabilities),
    labels = COALESCE(@labels, labels)
WHERE id = @id AND tenant_id = @tenant
RETURNING {AgentColumns}, (SELECT status FROM previous)", connection))
        {
            command.Parameters.AddWithValue("id", agentId);
            command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
            command.Parameters.AddWithValue("status", NpgsqlDbType.Varchar, (object?)heartbeat?.Status?.Trim().ToLowerInvariant() ?? DBNull.Value);
            command.Parameters.Add(heartbeat?.Capabilities is { } capabilities ? Json("capabilities", NormalizeCapabilities(capabilities)) : JsonNull("capabilities"));
            command.Parameters.Add(heartbeat?.Labels is { } labels ? Json("labels", labels) : JsonNull("labels"));
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                agent = ReadAgent(reader);
                previousStatus = reader.IsDBNull(13) ? null : reader.GetString(13);
            }
        }
        if (agent is null) return null;

        await using (var command = new NpgsqlCommand($"UPDATE runtime_leases SET heartbeat_at = {Now} WHERE agent_id = @id AND status = 'active'", connection))
        {
            command.Parameters.AddWithValue("id", agentId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        if (previousStatus == "offline") await PublishEventAsync("agent.online", agent.TenantId, agentId, null, agent, cancellationToken);
        if (agent.Status == "idle") await ScheduleQueuedAsync(cancellationToken);
        return agent;
    }

    public async Task<RuntimeAgentView?> DeregisterAsync(string agentId, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await AcquireDispatchLockAsync(connection, transaction, cancellationToken);
        var lost = await ExpireAgentLeasesAsync(connection, transaction, agentId, "runtime agent deregistered", cancellationToken, _requestContext.TenantId);
        RuntimeAgentView? agent = null;
        await using (var command = new NpgsqlCommand($"UPDATE runtime_agents SET status = 'offline', updated_at = {Now} WHERE id = @id AND tenant_id = @tenant RETURNING {AgentColumns}", connection, transaction))
        {
            command.Parameters.AddWithValue("id", agentId);
            command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken)) agent = ReadAgent(reader);
        }
        if (agent is null) return null;
        await AuditAsync(connection, transaction, agent.TenantId, _requestContext.Principal.Subject, "runtime.agent.deregister", "runtime_agent", agentId, new { }, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        await PublishLostExecutionsAsync(agentId, lost, cancellationToken);
        await PublishEventAsync("agent.offline", agent.TenantId, agentId, null, new { reason = "deregistered" }, cancellationToken);
        await ScheduleQueuedAsync(cancellationToken);
        return agent;
    }

    public async Task<IReadOnlyList<RuntimeAgentView>> ListAgentsAsync(string? status = null, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($@"
SELECT {AgentColumns} FROM runtime_agents
WHERE tenant_id = @tenant AND (@status::varchar IS NULL OR status = @status)
ORDER BY registered_at DESC", connection);
        command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
        command.Parameters.AddWithValue("status", NpgsqlDbType.Varchar, (object?)status ?? DBNull.Value);
        var agents = new List<RuntimeAgentView>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) agents.Add(ReadAgent(reader));
        return agents;
    }

    public async Task<RuntimeAgentView?> GetAgentAsync(string agentId, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($"SELECT {AgentColumns} FROM runtime_agents WHERE id = @id AND tenant_id = @tenant", connection);
        command.Parameters.AddWithValue("id", agentId);
        command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadAgent(reader) : null;
    }

    // ── Queue and dispatch ────────────────────────────────────────────────────

    public async Task<RuntimeQueueItem> ScheduleExecutionAsync(string executionId, RuntimeScheduleRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(executionId)) throw new ArgumentException("execution_id is required");
        var platform = string.IsNullOrWhiteSpace(request.Platform) ? "web" : request.Platform.Trim().ToLowerInvariant();
        var requirements = CapabilityRequirements(platform, request.RequiredCapabilities);
        var tenantId = _requestContext.TenantId;
        if (!string.IsNullOrWhiteSpace(request.TenantId) && !string.Equals(request.TenantId, tenantId, StringComparison.Ordinal))
        {
            throw new RuntimeConflictException("tenant_id must match the authenticated tenant");
        }

        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        RuntimeQueueItem item;
        await using (var command = new NpgsqlCommand($@"
INSERT INTO execution_queue (id, tenant_id, execution_id, status, platform, priority, required_capabilities, variables, dispatch_reason, queued_at)
VALUES (@id, @tenant, @execution, 'queued', @platform, @priority, @requirements, @variables, 'Waiting for compatible runtime agent.', {Now})
ON CONFLICT (execution_id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id, platform = EXCLUDED.platform, priority = EXCLUDED.priority,
    required_capabilities = EXCLUDED.required_capabilities, variables = EXCLUDED.variables,
    status = CASE WHEN execution_queue.status IN ('completed', 'cancelled', 'failed') THEN 'queued' ELSE execution_queue.status END,
    assigned_agent_id = CASE WHEN execution_queue.status IN ('completed', 'cancelled', 'failed') THEN NULL ELSE execution_queue.assigned_agent_id END,
    queued_at = CASE WHEN execution_queue.status IN ('completed', 'cancelled', 'failed') THEN EXCLUDED.queued_at ELSE execution_queue.queued_at END,
    dispatched_at = CASE WHEN execution_queue.status IN ('completed', 'cancelled', 'failed') THEN NULL ELSE execution_queue.dispatched_at END,
    started_at = CASE WHEN execution_queue.status IN ('completed', 'cancelled', 'failed') THEN NULL ELSE execution_queue.started_at END,
    completed_at = CASE WHEN execution_queue.status IN ('completed', 'cancelled', 'failed') THEN NULL ELSE execution_queue.completed_at END
RETURNING {QueueColumns}", connection, transaction))
        {
            command.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
            command.Parameters.AddWithValue("tenant", tenantId);
            command.Parameters.AddWithValue("execution", executionId);
            command.Parameters.AddWithValue("platform", platform);
            command.Parameters.AddWithValue("priority", request.Priority ?? 100);
            command.Parameters.Add(Json("requirements", requirements));
            command.Parameters.Add(Json("variables", request.Variables ?? new Dictionary<string, object?>()));
            try
            {
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                await reader.ReadAsync(cancellationToken);
                item = ReadQueueItem(reader);
            }
            catch (PostgresException exception) when (exception.SqlState == PostgresErrorCodes.ForeignKeyViolation)
            {
                throw new RuntimeConflictException($"Execution {executionId} does not exist");
            }
        }
        await AuditAsync(connection, transaction, tenantId, _requestContext.Principal.Subject, "runtime.execution.queue", "execution", executionId,
            new { platform, requirements, item.Priority }, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        await PublishEventAsync("execution.queued", tenantId, null, executionId, item, cancellationToken);
        await ScheduleQueuedAsync(cancellationToken);
        return await GetQueueItemAsync(executionId, cancellationToken) ?? item;
    }

    /// <summary>Matches queued executions to free, compatible agents. Returns the number dispatched.</summary>
    public async Task<int> ScheduleQueuedAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using (var probe = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM execution_queue WHERE status = 'queued')", connection))
        {
            if (await probe.ExecuteScalarAsync(cancellationToken) is not true) return 0;
        }

        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await AcquireDispatchLockAsync(connection, transaction, cancellationToken);

        var items = new List<(RuntimeQueueItem Item, string Variables)>();
        await using (var command = new NpgsqlCommand($@"
SELECT {QueueColumns}, variables::text FROM execution_queue
WHERE status = 'queued' ORDER BY priority ASC, queued_at ASC LIMIT 200 FOR UPDATE", connection, transaction))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken)) items.Add((ReadQueueItem(reader), reader.GetString(13)));
        }

        var agents = new List<AgentSlot>();
        await using (var command = new NpgsqlCommand($@"
SELECT id, tenant_id, capabilities::text, max_concurrency, active_leases FROM runtime_agents
WHERE status IN ('idle', 'ready') AND active_leases < max_concurrency
  AND last_heartbeat_at >= {Now} - make_interval(secs => @ttl)
ORDER BY active_leases ASC, last_heartbeat_at DESC FOR UPDATE", connection, transaction))
        {
            command.Parameters.AddWithValue("ttl", AgentTtl.TotalSeconds);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                agents.Add(new AgentSlot(reader.GetString(0), reader.GetString(1),
                    new HashSet<string>(ParseJson<string[]>(reader.GetString(2)) ?? [], StringComparer.OrdinalIgnoreCase),
                    reader.GetInt32(3), reader.GetInt32(4)));
            }
        }

        var dispatched = new List<(RuntimeQueueItem Item, AgentSlot Agent, string LeaseId, string CommandId)>();
        foreach (var (item, variables) in items)
        {
            var agent = agents.FirstOrDefault(candidate => candidate.TenantId == item.TenantId && candidate.Active < candidate.Max
                && Matches(candidate.Capabilities, item.Platform, item.RequiredCapabilities));
            if (agent is null)
            {
                if (item.DispatchReason != NoAgentReason)
                {
                    await using var command = new NpgsqlCommand("UPDATE execution_queue SET dispatch_reason = @reason WHERE id = @id", connection, transaction);
                    command.Parameters.AddWithValue("reason", NoAgentReason);
                    command.Parameters.AddWithValue("id", item.Id);
                    await command.ExecuteNonQueryAsync(cancellationToken);
                }
                continue;
            }

            var leaseId = Guid.NewGuid().ToString();
            var commandId = Guid.NewGuid().ToString();
            var payload = new JsonObject
            {
                ["execution_id"] = item.ExecutionId,
                ["tenant_id"] = item.TenantId,
                ["lease_id"] = leaseId,
                ["queue_id"] = item.Id,
                ["platform"] = item.Platform,
                ["priority"] = item.Priority,
                ["required_capabilities"] = new JsonArray(item.RequiredCapabilities.Select(value => (JsonNode?)value).ToArray()),
                ["variables"] = JsonNode.Parse(variables),
            };
            await using (var command = new NpgsqlCommand($@"
INSERT INTO runtime_leases (id, execution_id, agent_id, status, platform, acquired_at, heartbeat_at, metadata)
VALUES (@lease, @execution, @agent, 'active', @platform, {Now}, {Now}, @metadata);
UPDATE execution_queue SET status = 'dispatched', assigned_agent_id = @agent, dispatched_at = {Now},
    dispatch_reason = 'Assigned to compatible runtime agent.' WHERE id = @queue;
INSERT INTO runtime_agent_commands (id, tenant_id, agent_id, execution_id, lease_id, type, payload, status, created_at)
VALUES (@command, @tenant, @agent, @execution, @lease, 'run_execution', @payload, 'pending', {Now});", connection, transaction))
            {
                command.Parameters.AddWithValue("lease", leaseId);
                command.Parameters.AddWithValue("execution", item.ExecutionId);
                command.Parameters.AddWithValue("agent", agent.Id);
                command.Parameters.AddWithValue("platform", item.Platform);
                command.Parameters.Add(Json("metadata", new Dictionary<string, object?> { ["queue_id"] = item.Id, ["required_capabilities"] = item.RequiredCapabilities }));
                command.Parameters.AddWithValue("queue", item.Id);
                command.Parameters.AddWithValue("command", commandId);
                command.Parameters.AddWithValue("tenant", item.TenantId);
                command.Parameters.Add(new NpgsqlParameter("payload", NpgsqlDbType.Json) { Value = payload.ToJsonString() });
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            agent.Active++;
            dispatched.Add((item, agent, leaseId, commandId));
            await AuditAsync(connection, transaction, item.TenantId, "control-plane", "runtime.execution.dispatch", "execution", item.ExecutionId,
                new { agent_id = agent.Id, lease_id = leaseId, item.Platform }, cancellationToken);
        }

        foreach (var agent in dispatched.Select(entry => entry.Agent).Distinct())
        {
            await using var command = new NpgsqlCommand($@"
UPDATE runtime_agents SET active_leases = @active, updated_at = {Now},
    status = CASE WHEN @active >= max_concurrency THEN 'busy' ELSE 'idle' END
WHERE id = @id", connection, transaction);
            command.Parameters.AddWithValue("active", agent.Active);
            command.Parameters.AddWithValue("id", agent.Id);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);

        foreach (var (item, agent, leaseId, commandId) in dispatched)
        {
            await WakeAgentAsync(agent.Id, commandId, "run_execution", cancellationToken);
            await PublishEventAsync("execution.dispatched", item.TenantId, agent.Id, item.ExecutionId,
                new { queue_id = item.Id, lease_id = leaseId, platform = item.Platform }, cancellationToken);
        }
        return dispatched.Count;
    }

    public async Task<RuntimeQueueItem?> MarkRunningAsync(string executionId, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        RuntimeQueueItem? item = null;
        await using (var command = new NpgsqlCommand($@"
UPDATE execution_queue SET status = 'running', started_at = {Now}
WHERE execution_id = @execution AND tenant_id = @tenant AND status IN ('queued', 'dispatched')
RETURNING {QueueColumns}", connection))
        {
            command.Parameters.AddWithValue("execution", executionId);
            command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken)) item = ReadQueueItem(reader);
        }
        if (item is null) return await GetQueueItemAsync(executionId, cancellationToken);
        await PublishEventAsync("execution.running", item.TenantId, item.AssignedAgentId, executionId, new { queue_id = item.Id }, cancellationToken);
        return item;
    }

    public async Task<RuntimeQueueItem?> FinishAsync(string executionId, string finalStatus, CancellationToken cancellationToken = default)
    {
        var status = NormalizeFinalStatus(finalStatus);
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await AcquireDispatchLockAsync(connection, transaction, cancellationToken);
        var (item, released) = await FinishCoreAsync(connection, transaction, executionId, _requestContext.TenantId, status, cancellationToken);
        if (item is null && released.Count == 0) return null;
        await AuditAsync(connection, transaction, item?.TenantId ?? _requestContext.TenantId, _requestContext.Principal.Subject, "runtime.execution.finish", "execution", executionId,
            new { status, released_leases = released.Select(lease => lease.LeaseId) }, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        foreach (var lease in released)
        {
            await PublishEventAsync("lease.released", item?.TenantId ?? _requestContext.TenantId, lease.AgentId, executionId, new { lease_id = lease.LeaseId, final_status = status }, cancellationToken);
        }
        await PublishEventAsync("execution.finished", item?.TenantId ?? _requestContext.TenantId, item?.AssignedAgentId, executionId, new { status }, cancellationToken);
        await ScheduleQueuedAsync(cancellationToken);
        return item;
    }

    public async Task<RuntimeCancelResult?> CancelAsync(string executionId, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await AcquireDispatchLockAsync(connection, transaction, cancellationToken);

        string? status = null, agentId = null, tenantId = null;
        await using (var command = new NpgsqlCommand("SELECT status, assigned_agent_id, tenant_id FROM execution_queue WHERE execution_id = @execution AND tenant_id = @tenant FOR UPDATE", connection, transaction))
        {
            command.Parameters.AddWithValue("execution", executionId);
            command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                status = reader.GetString(0);
                agentId = reader.IsDBNull(1) ? null : reader.GetString(1);
                tenantId = reader.GetString(2);
            }
        }
        if (status is null || tenantId is null) return null;

        string? cancelCommandId = null;
        var resultStatus = status;
        if (status == "queued")
        {
            await FinishCoreAsync(connection, transaction, executionId, tenantId, "cancelled", cancellationToken);
            resultStatus = "cancelled";
        }
        else if (status is "dispatched" or "running" && agentId is not null)
        {
            cancelCommandId = Guid.NewGuid().ToString();
            await using (var command = new NpgsqlCommand($@"
INSERT INTO runtime_agent_commands (id, tenant_id, agent_id, execution_id, type, payload, status, created_at)
VALUES (@id, @tenant, @agent, @execution, 'cancel_execution', @payload, 'pending', {Now})", connection, transaction))
            {
                command.Parameters.AddWithValue("id", cancelCommandId);
                command.Parameters.AddWithValue("tenant", tenantId);
                command.Parameters.AddWithValue("agent", agentId);
                command.Parameters.AddWithValue("execution", executionId);
                command.Parameters.Add(Json("payload", new Dictionary<string, object?> { ["execution_id"] = executionId }));
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            resultStatus = "cancelling";

            // The run command never reached the worker: nothing is executing, release immediately.
            await using var withdraw = new NpgsqlCommand("UPDATE runtime_agent_commands SET status = 'cancelled' WHERE execution_id = @execution AND type = 'run_execution' AND status = 'pending'", connection, transaction);
            withdraw.Parameters.AddWithValue("execution", executionId);
            if (await withdraw.ExecuteNonQueryAsync(cancellationToken) > 0)
            {
                await FinishCoreAsync(connection, transaction, executionId, tenantId, "cancelled", cancellationToken);
                resultStatus = "cancelled";
            }
        }
        await AuditAsync(connection, transaction, tenantId, _requestContext.Principal.Subject, "runtime.execution.cancel", "execution", executionId, new { previous_status = status, agent_id = agentId }, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        if (cancelCommandId is not null && agentId is not null) await WakeAgentAsync(agentId, cancelCommandId, "cancel_execution", cancellationToken);
        await PublishEventAsync("execution.cancel_requested", tenantId, agentId, executionId, new { status = resultStatus }, cancellationToken);
        if (resultStatus == "cancelled") await ScheduleQueuedAsync(cancellationToken);
        return new RuntimeCancelResult(executionId, resultStatus, agentId);
    }

    public async Task<IReadOnlyList<RuntimeQueueItem>> ListQueueAsync(string? status = null, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($@"
SELECT {QueueColumns} FROM execution_queue
WHERE tenant_id = @tenant AND (@status::varchar IS NULL OR status = @status)
ORDER BY priority ASC, queued_at DESC LIMIT 500", connection);
        command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
        command.Parameters.AddWithValue("status", NpgsqlDbType.Varchar, (object?)status ?? DBNull.Value);
        var items = new List<RuntimeQueueItem>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) items.Add(ReadQueueItem(reader));
        return items;
    }

    public async Task<RuntimeQueueItem?> GetQueueItemAsync(string executionId, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($"SELECT {QueueColumns} FROM execution_queue WHERE execution_id = @execution AND tenant_id = @tenant", connection);
        command.Parameters.AddWithValue("execution", executionId);
        command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadQueueItem(reader) : null;
    }

    public async Task<IReadOnlyList<RuntimeLeaseView>> ListLeasesAsync(string? agentId = null, string? status = null, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand($@"
SELECT {LeaseColumns} FROM runtime_leases l JOIN runtime_agents a ON a.id = l.agent_id
WHERE a.tenant_id = @tenant AND (@agent::varchar IS NULL OR l.agent_id = @agent) AND (@status::varchar IS NULL OR l.status = @status)
ORDER BY l.acquired_at DESC LIMIT 500", connection);
        command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
        command.Parameters.AddWithValue("agent", NpgsqlDbType.Varchar, (object?)agentId ?? DBNull.Value);
        command.Parameters.AddWithValue("status", NpgsqlDbType.Varchar, (object?)status ?? DBNull.Value);
        var leases = new List<RuntimeLeaseView>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            leases.Add(new RuntimeLeaseView(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
                Utc(reader.GetDateTime(5)), UtcOrNull(reader, 6), UtcOrNull(reader, 7), ParseJson<Dictionary<string, object?>>(reader.GetString(8)) ?? []));
        }
        return leases;
    }

    // ── Agent commands and events ─────────────────────────────────────────────

    /// <summary>Atomically claims pending commands (pending → delivered). Null when the agent is unknown.</summary>
    public async Task<IReadOnlyList<RuntimeAgentCommand>?> ClaimCommandsAsync(string agentId, int limit = 10, CancellationToken cancellationToken = default)
    {
        await using var connection = await _db.OpenConnectionAsync(cancellationToken);
        await using (var exists = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM runtime_agents WHERE id = @id AND tenant_id = @tenant)", connection))
        {
            exists.Parameters.AddWithValue("id", agentId);
            exists.Parameters.AddWithValue("tenant", _requestContext.TenantId);
            if (await exists.ExecuteScalarAsync(cancellationToken) is not true) return null;
        }
        await using var command = new NpgsqlCommand($@"
UPDATE runtime_agent_commands SET status = 'delivered', delivered_at = {Now}, attempts = attempts + 1
WHERE id IN (
    SELECT id FROM runtime_agent_commands WHERE agent_id = @agent AND tenant_id = @tenant AND status = 'pending'
    ORDER BY created_at ASC LIMIT @limit FOR UPDATE SKIP LOCKED)
RETURNING {CommandColumns}", connection);
        command.Parameters.AddWithValue("agent", agentId);
        command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
        command.Parameters.AddWithValue("limit", Math.Clamp(limit, 1, 100));
        var commands = new List<RuntimeAgentCommand>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) commands.Add(ReadCommand(reader));
        return commands.OrderBy(item => item.CreatedAt).ToArray();
    }

    public async Task<RuntimeAgentCommand?> AckCommandAsync(string agentId, string commandId, RuntimeCommandAck ack, CancellationToken cancellationToken = default)
    {
        var status = ack.Status?.Trim().ToLowerInvariant();
        if (status is not ("completed" or "failed")) throw new ArgumentException("status must be 'completed' or 'failed'");

        RuntimeAgentCommand? acked = null;
        await using (var connection = await _db.OpenConnectionAsync(cancellationToken))
        {
            await using (var command = new NpgsqlCommand($@"
UPDATE runtime_agent_commands SET status = @status, acked_at = {Now}, error = @error
WHERE id = @id AND agent_id = @agent AND tenant_id = @tenant AND status IN ('pending', 'delivered')
RETURNING {CommandColumns}", connection))
            {
                command.Parameters.AddWithValue("status", status);
                command.Parameters.AddWithValue("error", (object?)ack.Error ?? DBNull.Value);
                command.Parameters.AddWithValue("id", commandId);
                command.Parameters.AddWithValue("agent", agentId);
                command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                if (await reader.ReadAsync(cancellationToken)) acked = ReadCommand(reader);
            }

            if (acked is null)
            {
                // Acks are idempotent: return the current state of an already-settled command.
                await using var command = new NpgsqlCommand($"SELECT {CommandColumns} FROM runtime_agent_commands WHERE id = @id AND agent_id = @agent AND tenant_id = @tenant", connection);
                command.Parameters.AddWithValue("id", commandId);
                command.Parameters.AddWithValue("agent", agentId);
                command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                return await reader.ReadAsync(cancellationToken) ? ReadCommand(reader) : null;
            }
        }

        if (status == "failed" && acked.Type == "run_execution" && acked.ExecutionId is not null)
        {
            await FinishAsync(acked.ExecutionId, "failed", cancellationToken);
        }
        return acked;
    }

    public async Task<object?> RecordEventAsync(string agentId, RuntimeAgentEvent agentEvent, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(agentEvent.Type)) throw new ArgumentException("type is required");
        var eventId = Guid.NewGuid().ToString();
        var occurredAt = agentEvent.OccurredAt?.ToUniversalTime() ?? DateTime.UtcNow;
        string? tenantId;
        await using (var connection = await _db.OpenConnectionAsync(cancellationToken))
        await using (var command = new NpgsqlCommand($@"
INSERT INTO runtime_agent_events (id, tenant_id, agent_id, execution_id, type, payload, occurred_at, received_at)
SELECT @id, tenant_id, id, @execution, @type, @payload, @occurred, {Now} FROM runtime_agents WHERE id = @agent AND tenant_id = @tenant
RETURNING tenant_id", connection))
        {
            command.Parameters.AddWithValue("id", eventId);
            command.Parameters.AddWithValue("execution", (object?)agentEvent.ExecutionId ?? DBNull.Value);
            command.Parameters.AddWithValue("type", agentEvent.Type.Trim());
            command.Parameters.Add(Json("payload", agentEvent.Payload ?? new Dictionary<string, object?>()));
            command.Parameters.AddWithValue("occurred", NpgsqlDbType.Timestamp, DateTime.SpecifyKind(occurredAt, DateTimeKind.Unspecified));
            command.Parameters.AddWithValue("agent", agentId);
            command.Parameters.AddWithValue("tenant", _requestContext.TenantId);
            tenantId = await command.ExecuteScalarAsync(cancellationToken) as string;
        }
        if (tenantId is null) return null;

        await PublishEventAsync($"agent.event.{SubjectToken(agentEvent.Type)}", tenantId, agentId, agentEvent.ExecutionId, agentEvent.Payload, cancellationToken);
        return new { accepted = true, id = eventId, agent_id = agentId, type = agentEvent.Type, occurred_at = occurredAt };
    }

    // ── Maintenance ───────────────────────────────────────────────────────────

    /// <summary>
    /// Marks silent agents offline, expires their leases (requeueing work that never
    /// started), redelivers unacknowledged commands and reschedules the queue.
    /// </summary>
    public async Task<RuntimeMaintenanceResult> RunMaintenanceAsync(CancellationToken cancellationToken = default)
    {
        var offline = new List<(string Id, string TenantId, List<LostExecution> Lost)>();
        var redelivered = new List<(string AgentId, string CommandId, string Type)>();
        var failedRuns = new List<(string ExecutionId, string CommandId)>();

        await using (var connection = await _db.OpenConnectionAsync(cancellationToken))
        {
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
            await AcquireDispatchLockAsync(connection, transaction, cancellationToken);

            var silent = new List<(string Id, string TenantId)>();
            await using (var command = new NpgsqlCommand($@"
UPDATE runtime_agents SET status = 'offline', updated_at = {Now}
WHERE status <> 'offline' AND (last_heartbeat_at IS NULL OR last_heartbeat_at < {Now} - make_interval(secs => @ttl))
RETURNING id, tenant_id", connection, transaction))
            {
                command.Parameters.AddWithValue("ttl", AgentTtl.TotalSeconds);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken)) silent.Add((reader.GetString(0), reader.GetString(1)));
            }
            foreach (var (id, tenantId) in silent)
            {
                var lost = await ExpireAgentLeasesAsync(connection, transaction, id, "heartbeat expired", cancellationToken);
                offline.Add((id, tenantId, lost));
                await AuditAsync(connection, transaction, tenantId, "control-plane", "runtime.agent.offline", "runtime_agent", id,
                    new { reason = "heartbeat expired", lost_executions = lost.Select(entry => entry.ExecutionId) }, cancellationToken);
            }

            await using (var command = new NpgsqlCommand($@"
UPDATE runtime_agent_commands SET
    status = CASE WHEN attempts >= @max THEN 'failed' ELSE 'pending' END,
    error = CASE WHEN attempts >= @max THEN 'Command was not acknowledged after ' || attempts || ' deliveries' ELSE error END
WHERE status = 'delivered' AND delivered_at < {Now} - make_interval(secs => @after)
RETURNING id, agent_id, status, type, execution_id", connection, transaction))
            {
                command.Parameters.AddWithValue("max", MaxCommandAttempts);
                command.Parameters.AddWithValue("after", CommandRedeliveryAfter.TotalSeconds);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken))
                {
                    if (reader.GetString(2) == "pending") redelivered.Add((reader.GetString(1), reader.GetString(0), reader.GetString(3)));
                    else if (reader.GetString(3) == "run_execution" && !reader.IsDBNull(4)) failedRuns.Add((reader.GetString(4), reader.GetString(0)));
                }
            }
            foreach (var (executionId, commandId) in failedRuns)
            {
                await using var tenantCommand = new NpgsqlCommand("SELECT tenant_id FROM runtime_agent_commands WHERE id = @id", connection, transaction);
                tenantCommand.Parameters.AddWithValue("id", commandId);
                var tenantId = await tenantCommand.ExecuteScalarAsync(cancellationToken) as string ?? "default";
                await FinishCoreAsync(connection, transaction, executionId, tenantId, "failed", cancellationToken);
            }
            await transaction.CommitAsync(cancellationToken);
        }

        foreach (var (id, tenantId, lost) in offline)
        {
            _logger.LogWarning("Runtime agent {AgentId} marked offline (heartbeat expired); {Count} lease(s) expired", id, lost.Count);
            await PublishLostExecutionsAsync(id, lost, cancellationToken);
            await PublishEventAsync("agent.offline", tenantId, id, null, new { reason = "heartbeat expired" }, cancellationToken);
        }
        foreach (var (agentId, commandId, type) in redelivered) await WakeAgentAsync(agentId, commandId, type, cancellationToken);
        var scheduled = await ScheduleQueuedAsync(cancellationToken);
        return new RuntimeMaintenanceResult(offline.Count, offline.Sum(entry => entry.Lost.Count), redelivered.Count, scheduled);
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private async Task<(RuntimeQueueItem? Item, List<(string LeaseId, string AgentId)> Released)> FinishCoreAsync(
        NpgsqlConnection connection, NpgsqlTransaction transaction, string executionId, string tenantId, string status, CancellationToken cancellationToken)
    {
        RuntimeQueueItem? item = null;
        await using (var command = new NpgsqlCommand($"UPDATE execution_queue SET status = @status, completed_at = {Now} WHERE execution_id = @execution AND tenant_id = @tenant RETURNING {QueueColumns}", connection, transaction))
        {
            command.Parameters.AddWithValue("status", status);
            command.Parameters.AddWithValue("execution", executionId);
            command.Parameters.AddWithValue("tenant", tenantId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken)) item = ReadQueueItem(reader);
        }

        var released = new List<(string LeaseId, string AgentId)>();
        await using (var command = new NpgsqlCommand($"UPDATE runtime_leases SET status = 'released', released_at = {Now} WHERE execution_id = @execution AND status = 'active' AND EXISTS (SELECT 1 FROM runtime_agents WHERE runtime_agents.id = runtime_leases.agent_id AND runtime_agents.tenant_id = @tenant) RETURNING id, agent_id", connection, transaction))
        {
            command.Parameters.AddWithValue("execution", executionId);
            command.Parameters.AddWithValue("tenant", tenantId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) released.Add((reader.GetString(0), reader.GetString(1)));
        }
        foreach (var (_, agentId) in released)
        {
            await using var command = new NpgsqlCommand($@"
UPDATE runtime_agents SET active_leases = GREATEST(active_leases - 1, 0), updated_at = {Now},
    status = CASE WHEN status IN ('offline', 'draining') THEN status
                  WHEN GREATEST(active_leases - 1, 0) >= max_concurrency THEN 'busy'
                  ELSE 'idle' END
WHERE id = @id", connection, transaction);
            command.Parameters.AddWithValue("id", agentId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        await using (var command = new NpgsqlCommand("UPDATE runtime_agent_commands SET status = 'cancelled' WHERE execution_id = @execution AND tenant_id = @tenant AND type = 'run_execution' AND status = 'pending'", connection, transaction))
        {
            command.Parameters.AddWithValue("execution", executionId);
            command.Parameters.AddWithValue("tenant", tenantId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        return (item, released);
    }

    private static async Task<List<LostExecution>> ExpireAgentLeasesAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string agentId, string reason, CancellationToken cancellationToken, string? tenantId = null)
    {
        var lost = new List<LostExecution>();
        await using (var command = new NpgsqlCommand($@"
WITH expired AS (
    UPDATE runtime_leases SET status = 'expired', released_at = {Now}
    WHERE agent_id = @agent AND status = 'active'
      AND (@tenant::varchar IS NULL OR EXISTS (SELECT 1 FROM runtime_agents WHERE runtime_agents.id = runtime_leases.agent_id AND runtime_agents.tenant_id = @tenant))
    RETURNING execution_id)
UPDATE execution_queue q SET
    status = CASE WHEN q.status = 'dispatched' THEN 'queued' ELSE 'failed' END,
    assigned_agent_id = CASE WHEN q.status = 'dispatched' THEN NULL ELSE q.assigned_agent_id END,
    dispatched_at = CASE WHEN q.status = 'dispatched' THEN NULL ELSE q.dispatched_at END,
    completed_at = CASE WHEN q.status = 'dispatched' THEN q.completed_at ELSE {Now} END,
    dispatch_reason = CASE WHEN q.status = 'dispatched' THEN 'Requeued: ' || @reason ELSE 'Runtime agent lost: ' || @reason END
FROM expired e
WHERE q.execution_id = e.execution_id AND q.status IN ('dispatched', 'running')
RETURNING q.execution_id, q.tenant_id, q.status", connection, transaction))
        {
            command.Parameters.AddWithValue("agent", agentId);
            command.Parameters.AddWithValue("reason", reason);
            command.Parameters.AddWithValue("tenant", NpgsqlDbType.Varchar, (object?)tenantId ?? DBNull.Value);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) lost.Add(new LostExecution(reader.GetString(0), reader.GetString(1), reader.GetString(2)));
        }
        await using (var command = new NpgsqlCommand($@"
UPDATE runtime_agents SET active_leases = 0, updated_at = {Now} WHERE id = @agent AND (@tenant::varchar IS NULL OR tenant_id = @tenant);
UPDATE runtime_agent_commands SET status = 'expired' WHERE agent_id = @agent AND (@tenant::varchar IS NULL OR tenant_id = @tenant) AND status IN ('pending', 'delivered');", connection, transaction))
        {
            command.Parameters.AddWithValue("agent", agentId);
            command.Parameters.AddWithValue("tenant", NpgsqlDbType.Varchar, (object?)tenantId ?? DBNull.Value);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        return lost;
    }

    private async Task PublishLostExecutionsAsync(string agentId, IEnumerable<LostExecution> lost, CancellationToken cancellationToken)
    {
        foreach (var entry in lost)
        {
            var type = entry.Status == "queued" ? "execution.requeued" : "execution.agent_lost";
            await PublishEventAsync(type, entry.TenantId, agentId, entry.ExecutionId, new { status = entry.Status }, cancellationToken);
        }
    }

    private async Task WakeAgentAsync(string agentId, string commandId, string type, CancellationToken cancellationToken)
    {
        await _bus.PublishAsync($"nexus.runtime.agents.{agentId}.commands", new { agent_id = agentId, command_id = commandId, type }, cancellationToken);
    }

    private async Task PublishEventAsync(string type, string tenantId, string? agentId, string? executionId, object? data, CancellationToken cancellationToken)
    {
        await _bus.PublishAsync($"nexus.runtime.events.{type}", new
        {
            type,
            tenant_id = tenantId,
            agent_id = agentId,
            execution_id = executionId,
            data,
            occurred_at = DateTime.UtcNow,
        }, cancellationToken);
    }

    private static async Task AcquireDispatchLockAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, CancellationToken cancellationToken)
    {
        // Serialises dispatch decisions across control-plane instances.
        await using var command = new NpgsqlCommand($"SELECT pg_advisory_xact_lock({DispatchLockKey})", connection, transaction);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task AuditAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string tenantId, string actor, string action, string resourceType, string resourceId, object metadata, CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand($@"
INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, outcome, metadata, created_at)
VALUES (@id, @tenant, @actor, @action, @type, @resource, 'success', @metadata, {Now})", connection, transaction);
        command.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        command.Parameters.AddWithValue("tenant", tenantId.Length > 36 ? tenantId[..36] : tenantId);
        command.Parameters.AddWithValue("actor", actor);
        command.Parameters.AddWithValue("action", action);
        command.Parameters.AddWithValue("type", resourceType);
        command.Parameters.AddWithValue("resource", resourceId);
        command.Parameters.Add(Json("metadata", metadata));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    internal static string[] CapabilityRequirements(string platform, IEnumerable<string>? requested)
    {
        var requirements = NormalizeCapabilities(requested ?? []).ToList();
        if (!requirements.Contains(platform)) requirements.Insert(0, platform);
        return requirements.ToArray();
    }

    internal static bool Matches(IReadOnlySet<string> capabilities, string platform, IEnumerable<string> requirements)
    {
        var wildcard = capabilities.Contains("any");
        if (!wildcard && !capabilities.Contains(platform)) return false;
        return requirements.All(requirement => wildcard || requirement == platform || capabilities.Contains(requirement));
    }

    private static string[] NormalizeCapabilities(IEnumerable<string> values) =>
        values.Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => value.Trim().ToLowerInvariant()).Distinct().ToArray();

    private static string NormalizeFinalStatus(string? status)
    {
        var normalized = (status ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "completed" or "passed" or "success" => "completed",
            "cancelled" or "canceled" => "cancelled",
            "" => "completed",
            _ => normalized.Length > 30 ? normalized[..30] : normalized,
        };
    }

    private static string SubjectToken(string value)
    {
        var chars = value.Trim().ToLowerInvariant().Select(ch => char.IsLetterOrDigit(ch) || ch is '_' or '-' ? ch : '_').ToArray();
        return chars.Length == 0 ? "unknown" : new string(chars);
    }

    private static NpgsqlParameter Json(string name, object value) =>
        new(name, NpgsqlDbType.Json) { Value = JsonSerializer.Serialize(value) };

    private static NpgsqlParameter JsonNull(string name) =>
        new(name, NpgsqlDbType.Json) { Value = DBNull.Value };

    private static T? ParseJson<T>(string json)
    {
        try { return JsonSerializer.Deserialize<T>(json); }
        catch (JsonException) { return default; }
    }

    private static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);

    private static DateTime? UtcOrNull(NpgsqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : Utc(reader.GetDateTime(ordinal));

    private static RuntimeAgentView ReadAgent(NpgsqlDataReader reader) => new(
        reader.GetString(0),
        reader.GetString(1),
        reader.GetString(2),
        reader.GetString(3),
        reader.GetString(4),
        reader.IsDBNull(5) ? null : reader.GetString(5),
        reader.GetString(6),
        ParseJson<string[]>(reader.GetString(7)) ?? [],
        ParseJson<Dictionary<string, object?>>(reader.GetString(8)) ?? [],
        reader.GetInt32(9),
        reader.GetInt32(10),
        UtcOrNull(reader, 11),
        Utc(reader.GetDateTime(12)));

    private static RuntimeQueueItem ReadQueueItem(NpgsqlDataReader reader) => new(
        reader.GetString(0),
        reader.GetString(1),
        reader.GetString(2),
        reader.GetString(3),
        reader.GetString(4),
        reader.GetInt32(5),
        ParseJson<string[]>(reader.GetString(6)) ?? [],
        reader.IsDBNull(7) ? null : reader.GetString(7),
        reader.GetString(8),
        Utc(reader.GetDateTime(9)),
        UtcOrNull(reader, 10),
        UtcOrNull(reader, 11),
        UtcOrNull(reader, 12));

    private static RuntimeAgentCommand ReadCommand(NpgsqlDataReader reader) => new(
        reader.GetString(0),
        reader.GetString(1),
        reader.IsDBNull(2) ? null : reader.GetString(2),
        reader.IsDBNull(3) ? null : reader.GetString(3),
        reader.GetString(4),
        ParseJson<Dictionary<string, object?>>(reader.GetString(5)) ?? [],
        reader.GetString(6),
        reader.GetInt32(7),
        Utc(reader.GetDateTime(8)));

    private sealed class AgentSlot(string id, string tenantId, HashSet<string> capabilities, int max, int active)
    {
        public string Id { get; } = id;
        public string TenantId { get; } = tenantId;
        public HashSet<string> Capabilities { get; } = capabilities;
        public int Max { get; } = max;
        public int Active { get; set; } = active;
    }

    private sealed record LostExecution(string ExecutionId, string TenantId, string Status);
}

public sealed record RuntimeMaintenanceResult(int AgentsMarkedOffline, int LeasesExpired, int CommandsRedelivered, int Dispatched);
