namespace Nexus.DotNetBackend.Contracts;

public sealed record Principal(string Subject, string? Email, string[] Roles, string TenantId);

public sealed record ApiError(string Error, string TraceId);

public sealed record HealthResponse(string Status, DateTimeOffset Timestamp);

public sealed record DependencyHealthResponse(string Status, DateTimeOffset Timestamp, IReadOnlyDictionary<string, string> Details);
