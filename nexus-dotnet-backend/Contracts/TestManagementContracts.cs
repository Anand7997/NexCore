namespace Nexus.DotNetBackend.Contracts;

public sealed record ProjectView(string Id, string TenantId, string Name, string? Description, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record ProjectModuleView(string Id, string TenantId, string ProjectId, string Name, string? Description, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record TestCaseView(string Id, string TenantId, string ProjectId, string? ModuleId, string Name, string? Description, string Status, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record TestSuiteView(string Id, string TenantId, string ProjectId, string Name, string? Description, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record TestSuiteCaseView(string SuiteId, string TestCaseId, int Order);

public sealed record CreateProjectDto(string Name, string? Description);
public sealed record UpdateProjectDto(string? Name, string? Description);
public sealed record CreateProjectModuleDto(string Name, string? Description);
public sealed record UpdateProjectModuleDto(string? Name, string? Description);
public sealed record CreateTestCaseDto(string Name, string? ModuleId, string? Description, string? Status);
public sealed record UpdateTestCaseDto(string? Name, string? ModuleId, string? Description, string? Status);
public sealed record CreateTestSuiteDto(string Name, string? Description);
public sealed record UpdateTestSuiteDto(string? Name, string? Description);
public sealed record AddCasesToSuiteDto(string[] TestCaseIds);

public sealed record TestExecutionView(string Id, string TenantId, string? ProjectId, string? SuiteId, string Status, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record TestExecutionResultView(string Id, string ExecutionId, string? TestCaseId, string Status, string? Message, DateTimeOffset UpdatedAt);
public sealed record StartTestExecutionCommand(string? ProjectId, string? SuiteId, string[]? TestCaseIds);
public sealed record UpdateResultCommand(string? Status, string? Message);
