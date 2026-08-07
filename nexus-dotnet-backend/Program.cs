using Nexus.DotNetBackend.Contracts;
using Nexus.DotNetBackend.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<RequestContext>();
builder.Services.AddSingleton<RuntimeScheduler>();
builder.Services.AddSingleton<OrchestrationStore>();
builder.Services.AddSingleton<TestManagementStore>();
builder.Services.AddSingleton<AiGatewayStore>();
builder.Services.AddSingleton<IntentCatalogService>();
builder.Services.AddSingleton<LegacyModernRepository>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

app.UseCors();
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception)
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new ApiError("internal_server_error", context.TraceIdentifier));
    }
});

var legacyModernRepository = app.Services.GetRequiredService<LegacyModernRepository>();
await legacyModernRepository.EnsureSchemaAsync();

var api = app.MapGroup("/api");

api.MapGet("/health/live", () => new HealthResponse("ok", DateTimeOffset.UtcNow));
api.MapGet("/health", () => new DependencyHealthResponse("ok", DateTimeOffset.UtcNow, new Dictionary<string, string>
{
    ["postgres"] = "configured",
    ["nats"] = "not_configured",
    ["temporal"] = "not_configured"
}));
api.MapGet("/health/ready", () => new DependencyHealthResponse("ok", DateTimeOffset.UtcNow, new Dictionary<string, string>
{
    ["controlPlane"] = "ready",
    ["storage"] = "postgres"
}));

api.MapGet("/enterprise/readiness", () => Results.Ok(new
{
    rbac = "development-principal-enabled",
    tenantIsolation = "tenant-context-middleware-enabled",
    audit = "dotnet-schema-pending",
    secrets = "secret-ref-policy-required",
    deployment = "kubernetes-manifests-required",
    pythonWorkers = "removed-from-modern-stack",
    controlPlane = "dotnet-owned"
}));

api.MapPost("/ai/jobs", (CreateAiJobRequest request, AiGatewayStore store) => Results.Ok(store.Create(request)));
api.MapGet("/ai/jobs", (AiGatewayStore store) => Results.Ok(store.List()));
api.MapGet("/ai/jobs/{id}", (string id, AiGatewayStore store) => store.Get(id) is { } job ? Results.Ok(job) : Results.NotFound());
api.MapPost("/ai/results", (AiWorkerResult result, AiGatewayStore store) => store.Ingest(result) is { } job ? Results.Ok(job) : Results.NotFound());

api.MapGet("/intent/catalog", (IntentCatalogService service) => Results.Ok(service.Catalog()));
api.MapGet("/intent/capability-matrix", (IntentCatalogService service) => Results.Ok(service.CapabilityMatrix()));
api.MapGet("/intent/platforms", (IntentCatalogService service) => Results.Ok(service.PlatformsResponse()));
api.MapGet("/intent/schema", (IntentCatalogService service) => Results.Ok(service.SchemaManifest()));
api.MapGet("/intent/schema/migration-guide", (IntentCatalogService service) => Results.Ok(service.MigrationGuide()));
api.MapPost("/intent/compile", (CompileIntentPlanRequest request, IntentCatalogService service) => string.IsNullOrWhiteSpace(request.Platform) || request.Steps is null ? Results.BadRequest(new { error = "platform and steps are required" }) : Results.Ok(service.Compile(request)));
api.MapGet("/intent/parity-report", (IntentCatalogService service) => Results.Ok(service.ParityReport()));
api.MapGet("/intent/parity-report/summary", (IntentCatalogService service) => Results.Ok(service.ParitySummary()));
api.MapGet("/intent/runtime/validate", (IntentCatalogService service) => Results.Ok(service.ValidateAll()));
api.MapGet("/intent/runtime/validate/{platform}", (string platform, IntentCatalogService service) => Results.Ok(service.RuntimeStatus(platform, [])));
api.MapPost("/intent/runtime/readiness", (PlatformReadinessRequest request, IntentCatalogService service) => Results.Ok(service.RuntimeStatus(request.Platform, request.RequiredCapabilities ?? [])));

api.MapPost("/orchestration/executions", (StartExecutionCommand command, OrchestrationStore store) => Results.Ok(store.Start(command)));
api.MapGet("/orchestration/executions", (OrchestrationStore store) => Results.Ok(store.List()));
api.MapGet("/orchestration/executions/{id}", (string id, OrchestrationStore store) => store.Get(id) is { } run ? Results.Ok(run) : Results.NotFound());
api.MapGet("/orchestration/executions/{id}/status", (string id, OrchestrationStore store) => store.GetStatus(id) is { } status ? Results.Ok(status) : Results.NotFound());
api.MapPost("/orchestration/executions/{id}/cancel", (string id, CancelExecutionCommand command, OrchestrationStore store) => store.Cancel(id, command) is { } run ? Results.Accepted(value: run) : Results.NotFound());
api.MapPost("/orchestration/executions/{id}/heartbeat", (string id, HeartbeatRequest request, OrchestrationStore store) => store.Heartbeat(id, request.Progress) is { } run ? Results.Accepted(value: run) : Results.NotFound());

api.MapPost("/runtime/agents", (RuntimeAgentRegistration command, RuntimeScheduler scheduler) => Results.Ok(scheduler.Register(command)));
api.MapPost("/runtime/agents/{agentId}/heartbeat", (string agentId, RuntimeScheduler scheduler) => scheduler.Heartbeat(agentId) is { } agent ? Results.Ok(agent) : Results.NotFound());
api.MapPost("/runtime/agents/{agentId}/renew", (string agentId, RuntimeScheduler scheduler) => scheduler.Heartbeat(agentId) is { } agent ? Results.Ok(agent) : Results.NotFound());
api.MapGet("/runtime/agents/{agentId}/commands", (string agentId, RuntimeScheduler scheduler) => Results.Ok(scheduler.GetPendingCommands(agentId)));
api.MapPost("/runtime/agents/{agentId}/events", (string agentId, RuntimeAgentEvent @event, RuntimeScheduler scheduler) => Results.Ok(scheduler.PublishEvent(agentId, @event)));
api.MapGet("/runtime/agents", (RuntimeScheduler scheduler) => Results.Ok(scheduler.ListAgents()));
api.MapPost("/runtime/queue", (RuntimeQueueCommand command, RuntimeScheduler scheduler) => Results.Ok(scheduler.Enqueue(command)));
api.MapGet("/runtime/queue", (RuntimeScheduler scheduler) => Results.Ok(scheduler.ListQueue()));

api.MapPost("/test-management/projects", (CreateProjectDto dto, TestManagementStore store) => Results.Ok(store.CreateProject(dto)));
api.MapGet("/test-management/projects", (TestManagementStore store) => Results.Ok(store.ListProjects()));
api.MapGet("/test-management/projects/{id}", (string id, TestManagementStore store) => store.GetProject(id) is { } item ? Results.Ok(item) : Results.NotFound());
api.MapPatch("/test-management/projects/{id}", (string id, UpdateProjectDto dto, TestManagementStore store) => store.UpdateProject(id, dto) is { } item ? Results.Ok(item) : Results.NotFound());
api.MapDelete("/test-management/projects/{id}", (string id, TestManagementStore store) => store.DeleteProject(id) ? Results.NoContent() : Results.NotFound());
api.MapPost("/test-management/projects/{projectId}/modules", (string projectId, CreateProjectModuleDto dto, TestManagementStore store) => Results.Ok(store.CreateModule(projectId, dto)));
api.MapGet("/test-management/projects/{projectId}/modules", (string projectId, TestManagementStore store) => Results.Ok(store.ListModules(projectId)));
api.MapGet("/test-management/modules/{id}", (string id, TestManagementStore store) => store.GetModule(id) is { } item ? Results.Ok(item) : Results.NotFound());
api.MapPatch("/test-management/modules/{id}", (string id, UpdateProjectModuleDto dto, TestManagementStore store) => store.UpdateModule(id, dto) is { } item ? Results.Ok(item) : Results.NotFound());
api.MapDelete("/test-management/modules/{id}", (string id, TestManagementStore store) => store.DeleteModule(id) ? Results.NoContent() : Results.NotFound());
api.MapPost("/test-management/projects/{projectId}/test-cases", (string projectId, CreateTestCaseDto dto, TestManagementStore store) => Results.Ok(store.CreateCase(projectId, dto)));
api.MapGet("/test-management/projects/{projectId}/test-cases", (string projectId, string? moduleId, TestManagementStore store) => Results.Ok(store.ListCases(projectId, moduleId)));
api.MapGet("/test-management/test-cases/{id}", (string id, TestManagementStore store) => store.GetCase(id) is { } item ? Results.Ok(item) : Results.NotFound());
api.MapPatch("/test-management/test-cases/{id}", (string id, UpdateTestCaseDto dto, TestManagementStore store) => store.UpdateCase(id, dto) is { } item ? Results.Ok(item) : Results.NotFound());
api.MapDelete("/test-management/test-cases/{id}", (string id, TestManagementStore store) => store.DeleteCase(id) ? Results.NoContent() : Results.NotFound());
api.MapPost("/test-management/projects/{projectId}/test-suites", (string projectId, CreateTestSuiteDto dto, TestManagementStore store) => Results.Ok(store.CreateSuite(projectId, dto)));
api.MapGet("/test-management/projects/{projectId}/test-suites", (string projectId, TestManagementStore store) => Results.Ok(store.ListSuites(projectId)));
api.MapGet("/test-management/test-suites/{id}", (string id, TestManagementStore store) => store.GetSuite(id) is { } item ? Results.Ok(item) : Results.NotFound());
api.MapPatch("/test-management/test-suites/{id}", (string id, UpdateTestSuiteDto dto, TestManagementStore store) => store.UpdateSuite(id, dto) is { } item ? Results.Ok(item) : Results.NotFound());
api.MapDelete("/test-management/test-suites/{id}", (string id, TestManagementStore store) => store.DeleteSuite(id) ? Results.NoContent() : Results.NotFound());
api.MapPost("/test-management/test-suites/{suiteId}/cases", (string suiteId, AddCasesToSuiteDto dto, TestManagementStore store) => Results.Ok(store.AddCasesToSuite(suiteId, dto)));
api.MapDelete("/test-management/test-suites/{suiteId}/cases/{testCaseId}", (string suiteId, string testCaseId, TestManagementStore store) => store.RemoveCaseFromSuite(suiteId, testCaseId) ? Results.NoContent() : Results.NotFound());
api.MapPost("/test-management/executions", (StartTestExecutionCommand command, TestManagementStore store) => Results.Ok(store.StartExecution(command)));
api.MapGet("/test-management/executions", (string? projectId, TestManagementStore store) => Results.Ok(store.ListExecutions(projectId)));
api.MapGet("/test-management/executions/{id}", (string id, TestManagementStore store) => store.GetExecution(id) is { } item ? Results.Ok(new { execution = item.Execution, results = item.Results }) : Results.NotFound());
api.MapPost("/test-management/executions/{id}/cancel", (string id, TestManagementStore store) => store.CancelExecution(id) is { } item ? Results.Ok(item) : Results.NotFound());
api.MapGet("/test-management/executions/{id}/timeline", (string id, TestManagementStore store) => store.GetTimeline(id) is { } items ? Results.Ok(items) : Results.NotFound());
api.MapPatch("/test-management/executions/{id}/results/{resultId}", (string id, string resultId, UpdateResultCommand command, TestManagementStore store) => store.UpdateResult(id, resultId, command) is { } item ? Results.Ok(new { execution = item.Execution, result = item.Result }) : Results.NotFound());

api.MapGet("/projects", async (LegacyModernRepository repository) => Results.Ok(await repository.ListProjectsAsync()));
api.MapGet("/projects/{id}", async (string id, LegacyModernRepository repository) => (await repository.GetProjectAsync(id)) is { } project ? Results.Ok(project) : Results.NotFound());
api.MapPost("/projects", async (LegacyProjectUpsertRequest request, LegacyModernRepository repository) => Results.Ok(await repository.CreateProjectAsync(request)));
api.MapPut("/projects/{id}", async (string id, LegacyProjectUpsertRequest request, LegacyModernRepository repository) => (await repository.UpdateProjectAsync(id, request)) is { } project ? Results.Ok(project) : Results.NotFound(new { error = "Project not found" }));
api.MapDelete("/projects/{id}", async (string id, LegacyModernRepository repository) => (await repository.DeleteProjectAsync(id)) is { } response ? Results.Ok(response) : Results.NotFound(new { error = "Project not found" }));

api.MapGet("/modules", async (string project_id, LegacyModernRepository repository) => Results.Ok(new LegacyModuleListResponse(await repository.ListModulesAsync(project_id))));
api.MapGet("/modules/{id}", async (string id, LegacyModernRepository repository) => (await repository.GetModuleAsync(id)) is { } module ? Results.Ok(module) : Results.NotFound(new { error = "Module not found" }));
api.MapPost("/modules", async (LegacyModuleCreateRequest request, LegacyModernRepository repository) => Results.Ok(await repository.CreateModuleAsync(request)));
api.MapPut("/modules/{id}", async (string id, LegacyModuleUpdateRequest request, LegacyModernRepository repository) => (await repository.UpdateModuleAsync(id, request)) is { } module ? Results.Ok(module) : Results.NotFound(new { error = "Module not found" }));
api.MapDelete("/modules/{id}", async (string id, LegacyModernRepository repository) => (await repository.DeleteModuleAsync(id)) is { } response ? Results.Ok(response) : Results.NotFound(new { error = "Module not found" }));

api.MapGet("/testcases", async (string module_id, string? suite_type, LegacyModernRepository repository) => Results.Ok(new LegacyTestCaseListResponse(await repository.ListTestCasesAsync(module_id))));
api.MapGet("/testcases/bulk", async (string module_id, string? suite_types, LegacyModernRepository repository) =>
{
    var items = await repository.ListTestCasesAsync(module_id);
    var queried = string.IsNullOrWhiteSpace(suite_types)
        ? Array.Empty<string>()
        : suite_types.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    return Results.Ok(new LegacyTestCaseBulkResponse(items, queried, items.Count));
});
api.MapGet("/testcases/reusable", async (LegacyModernRepository repository) => Results.Ok(new LegacyTestCaseListResponse(await repository.ListReusableTestCasesAsync())));
api.MapPost("/testcases", async (LegacyTestCaseUpsertRequest request, LegacyModernRepository repository) => (await repository.CreateTestCaseAsync(request)) is { } testCase ? Results.Ok(testCase) : Results.BadRequest(new { error = "Module not found" }));
api.MapPut("/testcases/{id}", async (string id, LegacyTestCaseUpsertRequest request, LegacyModernRepository repository) => (await repository.UpdateTestCaseAsync(id, request)) is { } testCase ? Results.Ok(testCase) : Results.NotFound(new { error = "Test case not found" }));
api.MapDelete("/testcases/{id}", async (string id, LegacyModernRepository repository) => await repository.DeleteTestCaseAsync(id) ? Results.Ok(new { success = true }) : Results.NotFound(new { error = "Test case not found" }));

api.MapGet("/teststeps/{testCaseName}", async (string testCaseName, string? project_name, string? module_name, LegacyModernRepository repository) => Results.Ok(await repository.GetTestStepsAsync(testCaseName, project_name, module_name)));
api.MapPost("/teststeps/{testCaseName}/bulk", async (string testCaseName, LegacyTestStepBulkSaveRequest request, LegacyModernRepository repository) => Results.Ok(new LegacyTestStepsSaveResponse(await repository.SaveTestStepsAsync(testCaseName, request))));

api.MapGet("/custom-test-suites", async (LegacyModernRepository repository) => Results.Ok(new LegacyCustomTestSuiteListResponse(await repository.ListCustomSuitesAsync())));
api.MapPost("/custom-test-suites", async (LegacyCustomTestSuiteUpsertRequest request, LegacyModernRepository repository) => Results.Ok(await repository.CreateCustomSuiteAsync(request)));
api.MapPut("/custom-test-suites/{id}", async (string id, LegacyCustomTestSuiteUpsertRequest request, LegacyModernRepository repository) => (await repository.UpdateCustomSuiteAsync(id, request)) is { } suite ? Results.Ok(suite) : Results.NotFound(new { error = "Suite not found" }));
api.MapDelete("/custom-test-suites/{id}", async (string id, LegacyModernRepository repository) => await repository.DeleteCustomSuiteAsync(id) ? Results.Ok(new { success = true }) : Results.NotFound(new { error = "Suite not found" }));
api.MapGet("/custom-test-suites/{id}/test-cases", async (string id, LegacyModernRepository repository) => Results.Ok(new LegacySuiteTestCaseListResponse(await repository.GetCustomSuiteTestCasesAsync(id))));
api.MapPost("/custom-test-suites/{id}/test-cases", async (string id, LegacyCustomTestSuiteCasesSaveRequest request, LegacyModernRepository repository) => Results.Ok(new { saved_count = await repository.SaveCustomSuiteTestCasesAsync(id, request.TestCases) }));

app.Run();

public sealed record HeartbeatRequest(int Progress);


