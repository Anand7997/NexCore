namespace Nexus.DotNetBackend.Contracts;

public sealed record StartExecutionCommand(
    string? WorkflowId,
    string? TestSuiteId,
    string? Platform,
    IReadOnlyDictionary<string, object?>? Variables);

public sealed record CancelExecutionCommand(string? Reason);

public sealed record ExecutionView(
    string Id,
    string TenantId,
    string? WorkflowId,
    string? TestSuiteId,
    string? Platform,
    string Status,
    int Progress,
    IReadOnlyDictionary<string, object?> Variables,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string CreatedBy);

public sealed record ExecutionStatusView(string Id, string Status, int Progress, DateTimeOffset UpdatedAt);
