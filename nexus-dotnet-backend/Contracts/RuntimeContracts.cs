namespace Nexus.DotNetBackend.Contracts;

public sealed record RuntimeAgentRegistration(
    string? AgentId,
    string Name,
    string[] Capabilities,
    string[] Platforms,
    string? Version);

public sealed record RuntimeAgentView(
    string AgentId,
    string Name,
    string[] Capabilities,
    string[] Platforms,
    string? Version,
    string TenantId,
    DateTimeOffset RegisteredAt,
    DateTimeOffset LastHeartbeatAt,
    DateTimeOffset LeaseExpiresAt,
    string Status);

public sealed record RuntimeAgentCommand(
    string Id,
    string ExecutionId,
    string Type,
    IReadOnlyDictionary<string, object?> Payload,
    DateTimeOffset CreatedAt);

public sealed record RuntimeAgentEvent(
    string? ExecutionId,
    string Type,
    IReadOnlyDictionary<string, object?>? Payload,
    DateTimeOffset? OccurredAt);

public sealed record RuntimeQueueCommand(
    string? TenantId,
    string ExecutionId,
    string Platform,
    string[] RequiredCapabilities,
    IReadOnlyDictionary<string, object?>? Variables);

public sealed record RuntimeQueueItem(
    string Id,
    string TenantId,
    string ExecutionId,
    string Platform,
    string[] RequiredCapabilities,
    IReadOnlyDictionary<string, object?> Variables,
    string Status,
    DateTimeOffset CreatedAt);
