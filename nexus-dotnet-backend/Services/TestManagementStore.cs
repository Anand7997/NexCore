using System.Collections.Concurrent;
using Nexus.DotNetBackend.Contracts;

namespace Nexus.DotNetBackend.Services;

public sealed class TestManagementStore
{
    private readonly ConcurrentDictionary<string, ProjectView> _projects = new();
    private readonly ConcurrentDictionary<string, ProjectModuleView> _modules = new();
    private readonly ConcurrentDictionary<string, TestCaseView> _cases = new();
    private readonly ConcurrentDictionary<string, TestSuiteView> _suites = new();
    private readonly ConcurrentDictionary<string, List<TestSuiteCaseView>> _suiteCases = new();
    private readonly ConcurrentDictionary<string, TestExecutionView> _executions = new();
    private readonly ConcurrentDictionary<string, List<TestExecutionResultView>> _results = new();
    private readonly RequestContext _requestContext;

    public TestManagementStore(RequestContext requestContext)
    {
        _requestContext = requestContext;
    }

    public ProjectView CreateProject(CreateProjectDto dto)
    {
        var now = DateTimeOffset.UtcNow;
        var project = new ProjectView($"proj_{Guid.NewGuid():N}", _requestContext.TenantId, dto.Name, dto.Description, now, now);
        _projects[project.Id] = project;
        return project;
    }

    public IReadOnlyList<ProjectView> ListProjects() => _projects.Values.Where(InTenant).OrderBy(p => p.Name).ToArray();
    public ProjectView? GetProject(string id) => GetTenantItem(_projects, id);
    public ProjectView? UpdateProject(string id, UpdateProjectDto dto) => Update(_projects, id, p => p with { Name = dto.Name ?? p.Name, Description = dto.Description ?? p.Description, UpdatedAt = DateTimeOffset.UtcNow });
    public bool DeleteProject(string id) => _projects.TryRemove(id, out _);

    public ProjectModuleView CreateModule(string projectId, CreateProjectModuleDto dto)
    {
        var now = DateTimeOffset.UtcNow;
        var module = new ProjectModuleView($"mod_{Guid.NewGuid():N}", _requestContext.TenantId, projectId, dto.Name, dto.Description, now, now);
        _modules[module.Id] = module;
        return module;
    }

    public IReadOnlyList<ProjectModuleView> ListModules(string projectId) => _modules.Values.Where(m => InTenant(m) && m.ProjectId == projectId).OrderBy(m => m.Name).ToArray();
    public ProjectModuleView? GetModule(string id) => GetTenantItem(_modules, id);
    public ProjectModuleView? UpdateModule(string id, UpdateProjectModuleDto dto) => Update(_modules, id, m => m with { Name = dto.Name ?? m.Name, Description = dto.Description ?? m.Description, UpdatedAt = DateTimeOffset.UtcNow });
    public bool DeleteModule(string id) => _modules.TryRemove(id, out _);

    public TestCaseView CreateCase(string projectId, CreateTestCaseDto dto)
    {
        var now = DateTimeOffset.UtcNow;
        var testCase = new TestCaseView($"tc_{Guid.NewGuid():N}", _requestContext.TenantId, projectId, dto.ModuleId, dto.Name, dto.Description, dto.Status ?? "draft", now, now);
        _cases[testCase.Id] = testCase;
        return testCase;
    }

    public IReadOnlyList<TestCaseView> ListCases(string projectId, string? moduleId) => _cases.Values.Where(c => InTenant(c) && c.ProjectId == projectId && (moduleId is null || c.ModuleId == moduleId)).OrderBy(c => c.Name).ToArray();
    public TestCaseView? GetCase(string id) => GetTenantItem(_cases, id);
    public TestCaseView? UpdateCase(string id, UpdateTestCaseDto dto) => Update(_cases, id, c => c with { Name = dto.Name ?? c.Name, ModuleId = dto.ModuleId ?? c.ModuleId, Description = dto.Description ?? c.Description, Status = dto.Status ?? c.Status, UpdatedAt = DateTimeOffset.UtcNow });
    public bool DeleteCase(string id) => _cases.TryRemove(id, out _);

    public TestSuiteView CreateSuite(string projectId, CreateTestSuiteDto dto)
    {
        var now = DateTimeOffset.UtcNow;
        var suite = new TestSuiteView($"suite_{Guid.NewGuid():N}", _requestContext.TenantId, projectId, dto.Name, dto.Description, now, now);
        _suites[suite.Id] = suite;
        return suite;
    }

    public IReadOnlyList<TestSuiteView> ListSuites(string projectId) => _suites.Values.Where(s => InTenant(s) && s.ProjectId == projectId).OrderBy(s => s.Name).ToArray();
    public TestSuiteView? GetSuite(string id) => GetTenantItem(_suites, id);
    public TestSuiteView? UpdateSuite(string id, UpdateTestSuiteDto dto) => Update(_suites, id, s => s with { Name = dto.Name ?? s.Name, Description = dto.Description ?? s.Description, UpdatedAt = DateTimeOffset.UtcNow });
    public bool DeleteSuite(string id) => _suites.TryRemove(id, out _);

    public IReadOnlyList<TestSuiteCaseView> AddCasesToSuite(string suiteId, AddCasesToSuiteDto dto)
    {
        var items = _suiteCases.GetOrAdd(suiteId, _ => []);
        foreach (var id in dto.TestCaseIds)
        {
            if (items.All(item => item.TestCaseId != id)) items.Add(new TestSuiteCaseView(suiteId, id, items.Count + 1));
        }
        return items.ToArray();
    }

    public bool RemoveCaseFromSuite(string suiteId, string testCaseId)
    {
        if (!_suiteCases.TryGetValue(suiteId, out var items)) return false;
        return items.RemoveAll(item => item.TestCaseId == testCaseId) > 0;
    }

    public TestExecutionView StartExecution(StartTestExecutionCommand command)
    {
        var now = DateTimeOffset.UtcNow;
        var execution = new TestExecutionView($"texec_{Guid.NewGuid():N}", _requestContext.TenantId, command.ProjectId, command.SuiteId, "running", now, now);
        _executions[execution.Id] = execution;
        var resultCases = command.TestCaseIds ?? [];
        _results[execution.Id] = resultCases.Select(id => new TestExecutionResultView($"result_{Guid.NewGuid():N}", execution.Id, id, "queued", null, now)).ToList();
        return execution;
    }

    public IReadOnlyList<TestExecutionView> ListExecutions(string? projectId) => _executions.Values.Where(e => InTenant(e) && (projectId is null || e.ProjectId == projectId)).OrderByDescending(e => e.CreatedAt).ToArray();
    public (TestExecutionView Execution, IReadOnlyList<TestExecutionResultView> Results)? GetExecution(string id) => GetTenantItem(_executions, id) is { } e ? (e, _results.GetValueOrDefault(id, [])) : null;
    public TestExecutionView? CancelExecution(string id) => Update(_executions, id, e => e with { Status = "cancelled", UpdatedAt = DateTimeOffset.UtcNow });
    public IReadOnlyList<TestExecutionResultView>? GetTimeline(string id) => GetTenantItem(_executions, id) is null ? null : _results.GetValueOrDefault(id, []);

    public (TestExecutionView Execution, TestExecutionResultView Result)? UpdateResult(string id, string resultId, UpdateResultCommand command)
    {
        var execution = GetTenantItem(_executions, id);
        if (execution is null || !_results.TryGetValue(id, out var results)) return null;
        var index = results.FindIndex(r => r.Id == resultId);
        if (index < 0) return null;
        var result = results[index] with { Status = command.Status ?? results[index].Status, Message = command.Message ?? results[index].Message, UpdatedAt = DateTimeOffset.UtcNow };
        results[index] = result;
        var updatedExecution = execution with { UpdatedAt = DateTimeOffset.UtcNow };
        _executions[id] = updatedExecution;
        return (updatedExecution, result);
    }

    private bool InTenant(ProjectView value) => value.TenantId == _requestContext.TenantId;
    private bool InTenant(ProjectModuleView value) => value.TenantId == _requestContext.TenantId;
    private bool InTenant(TestCaseView value) => value.TenantId == _requestContext.TenantId;
    private bool InTenant(TestSuiteView value) => value.TenantId == _requestContext.TenantId;
    private bool InTenant(TestExecutionView value) => value.TenantId == _requestContext.TenantId;

    private T? GetTenantItem<T>(ConcurrentDictionary<string, T> dictionary, string id) where T : class
    {
        if (!dictionary.TryGetValue(id, out var item)) return null;
        var tenant = item.GetType().GetProperty("TenantId")?.GetValue(item)?.ToString();
        return tenant == _requestContext.TenantId ? item : null;
    }

    private T? Update<T>(ConcurrentDictionary<string, T> dictionary, string id, Func<T, T> update) where T : class
    {
        var current = GetTenantItem(dictionary, id);
        if (current is null) return null;
        var next = update(current);
        dictionary[id] = next;
        return next;
    }
}
