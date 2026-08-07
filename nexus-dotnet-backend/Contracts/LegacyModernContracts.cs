using System.Text.Json.Serialization;

namespace Nexus.DotNetBackend.Contracts;

public sealed record LegacyProjectDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("project_name")] string ProjectName,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("created_date")] string CreatedDate,
    [property: JsonPropertyName("created_by")] string CreatedBy,
    [property: JsonPropertyName("status")] string Status
);

public sealed record LegacyModuleDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("module_name")] string ModuleName,
    [property: JsonPropertyName("project_id")] string ProjectId,
    [property: JsonPropertyName("project_name")] string ProjectName,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("created_at")] string CreatedAt
);

public sealed record LegacyModuleListResponse(
    [property: JsonPropertyName("modules")] IReadOnlyList<LegacyModuleDto> Modules
);

public sealed record LegacyTestCaseDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("testcase_id")] string TestcaseId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("project_id")] string? ProjectId,
    [property: JsonPropertyName("module_id")] string? ModuleId,
    [property: JsonPropertyName("project_name")] string ProjectName,
    [property: JsonPropertyName("module_name")] string ModuleName,
    [property: JsonPropertyName("created_date")] string CreatedDate,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("priority")] string Priority,
    [property: JsonPropertyName("suite_type")] string SuiteType
);

public sealed record LegacyTestCaseListResponse(
    [property: JsonPropertyName("test_cases")] IReadOnlyList<LegacyTestCaseDto> TestCases
);

public sealed record LegacyTestCaseBulkResponse(
    [property: JsonPropertyName("test_cases")] IReadOnlyList<LegacyTestCaseDto> TestCases,
    [property: JsonPropertyName("suite_types_queried")] IReadOnlyList<string> SuiteTypesQueried,
    [property: JsonPropertyName("total_count")] int TotalCount
);

public sealed record LegacyTestStepDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("tc_id")] string TcId,
    [property: JsonPropertyName("step_no")] int StepNo,
    [property: JsonPropertyName("test_step_description")] string TestStepDescription,
    [property: JsonPropertyName("page")] string Page,
    [property: JsonPropertyName("element_name")] string ElementName,
    [property: JsonPropertyName("action_type")] string ActionType,
    [property: JsonPropertyName("assertion_type")] string AssertionType,
    [property: JsonPropertyName("secondary_action")] string SecondaryAction,
    [property: JsonPropertyName("secondary_value")] string SecondaryValue,
    [property: JsonPropertyName("xpath")] string XPath,
    [property: JsonPropertyName("values")] string Values
);

public sealed record LegacyCustomTestSuiteDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("icon")] string Icon,
    [property: JsonPropertyName("gradient")] string Gradient,
    [property: JsonPropertyName("testCount")] int TestCount,
    [property: JsonPropertyName("lastRun")] string LastRun,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("created_at")] string CreatedAt,
    [property: JsonPropertyName("updated_at")] string UpdatedAt
);

public sealed record LegacyCustomTestSuiteListResponse(
    [property: JsonPropertyName("test_suites")] IReadOnlyList<LegacyCustomTestSuiteDto> TestSuites
);

public sealed record LegacySuiteTestCaseListResponse(
    [property: JsonPropertyName("test_cases")] IReadOnlyList<LegacyTestCaseDto> TestCases
);

public sealed record LegacyProjectDeletionSummary(
    [property: JsonPropertyName("project_name")] string ProjectName,
    [property: JsonPropertyName("modules_deleted")] int ModulesDeleted,
    [property: JsonPropertyName("test_suites_deleted")] int TestSuitesDeleted,
    [property: JsonPropertyName("test_cases_deleted")] int TestCasesDeleted,
    [property: JsonPropertyName("test_steps_tables_deleted")] int TestStepsDeleted,
    [property: JsonPropertyName("execution_results_preserved")] int ExecutionResultsPreserved
);

public sealed record LegacyProjectDeleteResponse(
    [property: JsonPropertyName("deletion_summary")] LegacyProjectDeletionSummary DeletionSummary
);

public sealed record LegacyModuleDeletionSummary(
    [property: JsonPropertyName("module_name")] string ModuleName,
    [property: JsonPropertyName("test_suites_deleted")] int TestSuitesDeleted,
    [property: JsonPropertyName("test_cases_deleted")] int TestCasesDeleted,
    [property: JsonPropertyName("test_steps_tables_deleted")] int TestStepsDeleted,
    [property: JsonPropertyName("execution_results_preserved")] int ExecutionResultsPreserved
);

public sealed record LegacyModuleDeleteResponse(
    [property: JsonPropertyName("deletion_summary")] LegacyModuleDeletionSummary DeletionSummary
);

public sealed record LegacyProjectUpsertRequest(
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("status")] string? Status
);

public sealed record LegacyModuleCreateRequest(
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("project_id")] string? ProjectId
);

public sealed record LegacyModuleUpdateRequest(
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("description")] string? Description
);

public sealed record LegacyTestCaseUpsertRequest(
    [property: JsonPropertyName("suite_type")] string? SuiteType,
    [property: JsonPropertyName("module_id")] string? ModuleId,
    [property: JsonPropertyName("project_name")] string? ProjectName,
    [property: JsonPropertyName("module_name")] string? ModuleName,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("priority")] string? Priority,
    [property: JsonPropertyName("status")] string? Status
);

public sealed record LegacyTestStepSaveItem(
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("tc_id")] string? TcId,
    [property: JsonPropertyName("step_no")] int? StepNo,
    [property: JsonPropertyName("test_step_description")] string? TestStepDescription,
    [property: JsonPropertyName("page")] string? Page,
    [property: JsonPropertyName("element_name")] string? ElementName,
    [property: JsonPropertyName("action_type")] string? ActionType,
    [property: JsonPropertyName("assertion_type")] string? AssertionType,
    [property: JsonPropertyName("secondary_action")] string? SecondaryAction,
    [property: JsonPropertyName("secondary_value")] string? SecondaryValue,
    [property: JsonPropertyName("xpath")] string? XPath,
    [property: JsonPropertyName("values")] string? Values
);

public sealed record LegacyTestStepBulkSaveRequest(
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("clear_existing")] bool? ClearExisting,
    [property: JsonPropertyName("project_name")] string? ProjectName,
    [property: JsonPropertyName("module_name")] string? ModuleName,
    [property: JsonPropertyName("steps")] IReadOnlyList<LegacyTestStepSaveItem>? Steps
);

public sealed record LegacyTestStepsSaveResponse(
    [property: JsonPropertyName("saved_count")] int SavedCount
);

public sealed record LegacyCustomTestSuiteUpsertRequest(
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("icon")] string? Icon,
    [property: JsonPropertyName("gradient")] string? Gradient,
    [property: JsonPropertyName("testCount")] int? TestCount,
    [property: JsonPropertyName("lastRun")] string? LastRun,
    [property: JsonPropertyName("status")] string? Status
);

public sealed record LegacyTestCaseReference(
    [property: JsonPropertyName("id")] string Id
);

public sealed record LegacyCustomTestSuiteCasesSaveRequest(
    [property: JsonPropertyName("test_cases")] IReadOnlyList<LegacyTestCaseReference>? TestCases
);
