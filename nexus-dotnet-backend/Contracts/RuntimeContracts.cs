using System.Text.Json.Serialization;

namespace Nexus.DotNetBackend.Contracts;

// Runtime contracts are snake_case: they are consumed by the Python workers and
// both dashboards, which already speak the snake_case runtime-agent shape.

public sealed record RuntimeAgentRegistration(
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("agent_type")] string? AgentType,
    [property: JsonPropertyName("endpoint")] string? Endpoint,
    [property: JsonPropertyName("version")] string? Version,
    [property: JsonPropertyName("capabilities")] string[]? Capabilities,
    [property: JsonPropertyName("platforms")] string[]? Platforms,
    [property: JsonPropertyName("labels")] Dictionary<string, object?>? Labels,
    [property: JsonPropertyName("max_concurrency")] int? MaxConcurrency);

public sealed record RuntimeAgentHeartbeat(
    [property: JsonPropertyName("status")] string? Status,
    [property: JsonPropertyName("active_leases")] int? ActiveLeases,
    [property: JsonPropertyName("capabilities")] string[]? Capabilities,
    [property: JsonPropertyName("labels")] Dictionary<string, object?>? Labels);

public sealed record RuntimeAgentView(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("tenant_id")] string TenantId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("agent_type")] string AgentType,
    [property: JsonPropertyName("endpoint")] string? Endpoint,
    [property: JsonPropertyName("version")] string Version,
    [property: JsonPropertyName("capabilities")] string[] Capabilities,
    [property: JsonPropertyName("labels")] Dictionary<string, object?> Labels,
    [property: JsonPropertyName("max_concurrency")] int MaxConcurrency,
    [property: JsonPropertyName("active_leases")] int ActiveLeases,
    [property: JsonPropertyName("last_heartbeat_at")] DateTime? LastHeartbeatAt,
    [property: JsonPropertyName("registered_at")] DateTime RegisteredAt);

public sealed record RuntimeScheduleRequest(
    [property: JsonPropertyName("execution_id")] string? ExecutionId,
    [property: JsonPropertyName("tenant_id")] string? TenantId,
    [property: JsonPropertyName("platform")] string? Platform,
    [property: JsonPropertyName("priority")] int? Priority,
    [property: JsonPropertyName("required_capabilities")] string[]? RequiredCapabilities,
    [property: JsonPropertyName("variables")] Dictionary<string, object?>? Variables);

public sealed record RuntimeQueueItem(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("tenant_id")] string TenantId,
    [property: JsonPropertyName("execution_id")] string ExecutionId,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("platform")] string Platform,
    [property: JsonPropertyName("priority")] int Priority,
    [property: JsonPropertyName("required_capabilities")] string[] RequiredCapabilities,
    [property: JsonPropertyName("assigned_agent_id")] string? AssignedAgentId,
    [property: JsonPropertyName("dispatch_reason")] string DispatchReason,
    [property: JsonPropertyName("queued_at")] DateTime QueuedAt,
    [property: JsonPropertyName("dispatched_at")] DateTime? DispatchedAt,
    [property: JsonPropertyName("started_at")] DateTime? StartedAt,
    [property: JsonPropertyName("completed_at")] DateTime? CompletedAt);

public sealed record RuntimeLeaseView(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("execution_id")] string ExecutionId,
    [property: JsonPropertyName("agent_id")] string AgentId,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("platform")] string Platform,
    [property: JsonPropertyName("acquired_at")] DateTime AcquiredAt,
    [property: JsonPropertyName("released_at")] DateTime? ReleasedAt,
    [property: JsonPropertyName("heartbeat_at")] DateTime? HeartbeatAt,
    [property: JsonPropertyName("lease_metadata")] Dictionary<string, object?> LeaseMetadata);

public sealed record RuntimeAgentCommand(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("agent_id")] string AgentId,
    [property: JsonPropertyName("execution_id")] string? ExecutionId,
    [property: JsonPropertyName("lease_id")] string? LeaseId,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("payload")] Dictionary<string, object?> Payload,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("attempts")] int Attempts,
    [property: JsonPropertyName("created_at")] DateTime CreatedAt);

public sealed record RuntimeCommandAck(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("error")] string? Error);

public sealed record RuntimeAgentEvent(
    [property: JsonPropertyName("execution_id")] string? ExecutionId,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("payload")] Dictionary<string, object?>? Payload,
    [property: JsonPropertyName("occurred_at")] DateTime? OccurredAt);

public sealed record RuntimeFinishRequest(
    [property: JsonPropertyName("status")] string Status);

public sealed record RuntimeCancelResult(
    [property: JsonPropertyName("execution_id")] string ExecutionId,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("agent_id")] string? AgentId);

public sealed class RuntimeConflictException(string message) : Exception(message);
