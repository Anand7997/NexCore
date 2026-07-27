using System.Collections.Concurrent;
using Nexus.DotNetBackend.Contracts;

namespace Nexus.DotNetBackend.Services;

public sealed class OrchestrationStore
{
    private readonly ConcurrentDictionary<string, ExecutionView> _executions = new();
    private readonly RequestContext _requestContext;

    public OrchestrationStore(RequestContext requestContext)
    {
        _requestContext = requestContext;
    }

    public ExecutionView Start(StartExecutionCommand command)
    {
        var now = DateTimeOffset.UtcNow;
        var run = new ExecutionView(
            $"exec_{Guid.NewGuid():N}",
            _requestContext.TenantId,
            command.WorkflowId,
            command.TestSuiteId,
            command.Platform,
            "running",
            0,
            command.Variables ?? new Dictionary<string, object?>(),
            now,
            now,
            _requestContext.Principal.Subject);
        _executions[run.Id] = run;
        return run;
    }

    public IReadOnlyList<ExecutionView> List() => _executions.Values.OrderByDescending(e => e.CreatedAt).ToArray();

    public ExecutionView? Get(string id) => _executions.TryGetValue(id, out var execution) ? execution : null;

    public ExecutionStatusView? GetStatus(string id)
    {
        var execution = Get(id);
        return execution is null ? null : new ExecutionStatusView(execution.Id, execution.Status, execution.Progress, execution.UpdatedAt);
    }

    public ExecutionView? Cancel(string id, CancelExecutionCommand command)
    {
        if (!_executions.TryGetValue(id, out var execution)) return null;
        var updated = execution with { Status = "cancelled", UpdatedAt = DateTimeOffset.UtcNow };
        _executions[id] = updated;
        return updated;
    }

    public ExecutionView? Heartbeat(string id, int progress)
    {
        if (!_executions.TryGetValue(id, out var execution)) return null;
        var clamped = Math.Clamp(progress, 0, 100);
        var status = clamped >= 100 ? "completed" : execution.Status;
        var updated = execution with { Progress = clamped, Status = status, UpdatedAt = DateTimeOffset.UtcNow };
        _executions[id] = updated;
        return updated;
    }
}
