using System.Collections.Concurrent;
using Nexus.DotNetBackend.Contracts;

namespace Nexus.DotNetBackend.Services;

public sealed record AiJob(string Id, string Type, IReadOnlyDictionary<string, object?> Evidence, string Status, string TenantId, string CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, IReadOnlyDictionary<string, object?>? Result);
public sealed record CreateAiJobRequest(string Type, IReadOnlyDictionary<string, object?> Evidence);
public sealed record AiWorkerResult(string JobId, string Status, IReadOnlyDictionary<string, object?>? Result, string? Error);

public sealed class AiGatewayStore
{
    private readonly ConcurrentDictionary<string, AiJob> _jobs = new();
    private readonly RequestContext _requestContext;

    public AiGatewayStore(RequestContext requestContext)
    {
        _requestContext = requestContext;
    }

    public AiJob Create(CreateAiJobRequest request)
    {
        var now = DateTimeOffset.UtcNow;
        var job = new AiJob($"ai_{Guid.NewGuid():N}", request.Type, request.Evidence, "queued", _requestContext.TenantId, _requestContext.Principal.Subject, now, now, null);
        _jobs[job.Id] = job;
        return job;
    }

    public IReadOnlyList<AiJob> List() => _jobs.Values.Where(j => j.TenantId == _requestContext.TenantId).OrderByDescending(j => j.CreatedAt).ToArray();

    public AiJob? Get(string id) => _jobs.TryGetValue(id, out var job) && job.TenantId == _requestContext.TenantId ? job : null;

    public AiJob? Ingest(AiWorkerResult result)
    {
        if (!_jobs.TryGetValue(result.JobId, out var job)) return null;
        var status = string.IsNullOrWhiteSpace(result.Status) ? (result.Error is null ? "completed" : "failed") : result.Status;
        var updated = job with { Status = status, Result = result.Result, UpdatedAt = DateTimeOffset.UtcNow };
        _jobs[job.Id] = updated;
        return updated;
    }
}
