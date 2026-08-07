using System.Globalization;
using System.Text.Json;
using Nexus.DotNetBackend.Contracts;
using Npgsql;
using NpgsqlTypes;

namespace Nexus.DotNetBackend.Services;

public sealed class LegacyModernRepository
{
    private readonly string _connectionString;

    public LegacyModernRepository(IConfiguration configuration)
    {
        _connectionString = ResolveConnectionString(configuration);
    }

    public async Task EnsureSchemaAsync()
    {
        await using var connection = await OpenConnectionAsync();
        const string sql = @"
CREATE TABLE IF NOT EXISTS test_projects (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'active',
    automation_space VARCHAR(30) DEFAULT 'web',
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS test_modules (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL REFERENCES test_projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'active',
    automation_space VARCHAR(30) DEFAULT 'web',
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS test_cases (
    id VARCHAR(36) PRIMARY KEY,
    module_id VARCHAR(36) NOT NULL REFERENCES test_modules(id) ON DELETE CASCADE,
    project_id VARCHAR(36) REFERENCES test_projects(id) ON DELETE SET NULL,
    testing_type_id VARCHAR(36),
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'draft',
    automation_space VARCHAR(30) DEFAULT 'web',
    test_type VARCHAR(50) DEFAULT 'functional',
    priority VARCHAR(20) DEFAULT 'Medium',
    execution_mode VARCHAR(20) DEFAULT 'automated',
    platforms JSONB DEFAULT '[]'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    default_variables JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS test_steps (
    id VARCHAR(36) PRIMARY KEY,
    test_case_id VARCHAR(36) NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    automation_space VARCHAR(30) DEFAULT 'web',
    step_order INTEGER DEFAULT 1,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    action_type VARCHAR(100) DEFAULT '',
    input_value TEXT DEFAULT '',
    expected_result TEXT DEFAULT '',
    assertion_type VARCHAR(100) DEFAULT '',
    secondary_action VARCHAR(100) DEFAULT '',
    secondary_value TEXT DEFAULT '',
    is_enabled BOOLEAN DEFAULT TRUE,
    intent VARCHAR(100) DEFAULT 'action',
    target VARCHAR(255) DEFAULT '',
    test_data JSONB DEFAULT '{}'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    bindings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE test_projects ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE test_projects ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE test_projects ADD COLUMN IF NOT EXISTS automation_space VARCHAR(30) DEFAULT 'web';
ALTER TABLE test_projects ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE test_projects ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE test_projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE test_modules ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE test_modules ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE test_modules ADD COLUMN IF NOT EXISTS automation_space VARCHAR(30) DEFAULT 'web';
ALTER TABLE test_modules ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE test_modules ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE test_modules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS automation_space VARCHAR(30) DEFAULT 'web';
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS test_type VARCHAR(50) DEFAULT 'functional';
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'Medium';
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(20) DEFAULT 'automated';
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS platforms JSONB DEFAULT '[]'::jsonb;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS default_variables JSONB DEFAULT '{}'::jsonb;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS automation_space VARCHAR(30) DEFAULT 'web';
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS step_order INTEGER DEFAULT 1;
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS name VARCHAR(255) DEFAULT 'Step';
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS action_type VARCHAR(100) DEFAULT '';
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS input_value TEXT DEFAULT '';
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS expected_result TEXT DEFAULT '';
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS assertion_type VARCHAR(100) DEFAULT '';
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS secondary_action VARCHAR(100) DEFAULT '';
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS secondary_value TEXT DEFAULT '';
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS intent VARCHAR(100) DEFAULT 'action';
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS target VARCHAR(255) DEFAULT '';
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS test_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS bindings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE test_steps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS ix_test_modules_project_id ON test_modules(project_id);
CREATE INDEX IF NOT EXISTS ix_test_cases_module_id ON test_cases(module_id);
CREATE INDEX IF NOT EXISTS ix_test_cases_project_id ON test_cases(project_id);
CREATE INDEX IF NOT EXISTS ix_test_steps_test_case_id ON test_steps(test_case_id);
CREATE TABLE IF NOT EXISTS custom_test_suites (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    icon VARCHAR(100) DEFAULT 'Settings',
    gradient VARCHAR(120) DEFAULT 'from-gray-500 to-slate-500',
    status VARCHAR(20) DEFAULT 'active',
    last_run VARCHAR(120) DEFAULT 'Never',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS custom_test_suite_test_cases (
    suite_id VARCHAR(64) NOT NULL REFERENCES custom_test_suites(id) ON DELETE CASCADE,
    test_case_id VARCHAR(36) NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (suite_id, test_case_id)
);
CREATE INDEX IF NOT EXISTS ix_custom_test_suite_cases_suite_id ON custom_test_suite_test_cases(suite_id);
CREATE INDEX IF NOT EXISTS ix_custom_test_suite_cases_test_case_id ON custom_test_suite_test_cases(test_case_id);";
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    private async Task<NpgsqlConnection> OpenConnectionAsync()
    {
        var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        return connection;
    }

    public async Task<IReadOnlyList<LegacyProjectDto>> ListProjectsAsync()
    {
        const string sql = @"SELECT id, name, COALESCE(description, ''), COALESCE(status, 'active'), created_at FROM test_projects ORDER BY created_at DESC, name ASC;";
        var results = new List<LegacyProjectDto>();
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) results.Add(MapProject(reader));
        return results;
    }

    public async Task<LegacyProjectDto?> GetProjectAsync(string id)
    {
        const string sql = @"SELECT id, name, COALESCE(description, ''), COALESCE(status, 'active'), created_at FROM test_projects WHERE id = @id;";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapProject(reader) : null;
    }

    public async Task<LegacyProjectDto> CreateProjectAsync(LegacyProjectUpsertRequest request)
    {
        var id = Guid.NewGuid().ToString();
        const string sql = @"INSERT INTO test_projects (id, name, description, status, automation_space, tags, created_at, updated_at) VALUES (@id, @name, @description, @status, 'web', '[]'::jsonb, NOW(), NOW());";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("name", (request.Name ?? string.Empty).Trim());
        command.Parameters.AddWithValue("description", request.Description?.Trim() ?? string.Empty);
        command.Parameters.AddWithValue("status", NormalizeStatus(request.Status, "Active"));
        await command.ExecuteNonQueryAsync();
        return (await GetProjectAsync(id))!;
    }

    public async Task<LegacyProjectDto?> UpdateProjectAsync(string id, LegacyProjectUpsertRequest request)
    {
        const string sql = @"UPDATE test_projects SET name = COALESCE(@name, name), description = COALESCE(@description, description), status = COALESCE(@status, status), updated_at = NOW() WHERE id = @id;";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        AddNullableString(command, "name", request.Name?.Trim());
        AddNullableString(command, "description", request.Description?.Trim());
        AddNullableString(command, "status", request.Status is null ? null : NormalizeStatus(request.Status, request.Status));
        return await command.ExecuteNonQueryAsync() == 0 ? null : await GetProjectAsync(id);
    }

    public async Task<LegacyProjectDeleteResponse?> DeleteProjectAsync(string projectId)
    {
        await using var connection = await OpenConnectionAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        var project = await GetProjectInternalAsync(connection, transaction, projectId);
        if (project is null) return null;

        var moduleIds = await LoadIdsAsync(connection, transaction, "SELECT id FROM test_modules WHERE project_id = @project_id;", ("project_id", projectId));
        var caseIds = await LoadIdsAsync(connection, transaction, "SELECT id FROM test_cases WHERE project_id = @project_id;", ("project_id", projectId));
        var stepCount = await ExecuteCountAsync(connection, transaction, "SELECT COUNT(*) FROM test_steps WHERE test_case_id = ANY(@case_ids);", caseIds);
        var suiteCount = await ExecuteCountAsync(connection, transaction, "SELECT COUNT(*) FROM custom_test_suite_test_cases WHERE test_case_id = ANY(@case_ids);", caseIds);

        await DeleteByIdsAsync(connection, transaction, "DELETE FROM custom_test_suite_test_cases WHERE test_case_id = ANY(@ids);", caseIds);
        await DeleteByIdsAsync(connection, transaction, "DELETE FROM test_steps WHERE test_case_id = ANY(@ids);", caseIds);
        await DeleteByIdsAsync(connection, transaction, "DELETE FROM test_cases WHERE id = ANY(@ids);", caseIds);
        await DeleteByIdsAsync(connection, transaction, "DELETE FROM test_modules WHERE id = ANY(@ids);", moduleIds);
        await using (var deleteProject = new NpgsqlCommand("DELETE FROM test_projects WHERE id = @id;", connection, transaction))
        {
            deleteProject.Parameters.AddWithValue("id", projectId);
            await deleteProject.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();
        return new LegacyProjectDeleteResponse(new LegacyProjectDeletionSummary(project.Name, moduleIds.Count, suiteCount, caseIds.Count, stepCount, 0));
    }

    public async Task<IReadOnlyList<LegacyModuleDto>> ListModulesAsync(string projectId)
    {
        const string sql = @"SELECT m.id, m.name, COALESCE(m.description, ''), m.project_id, COALESCE(p.name, ''), m.created_at FROM test_modules m LEFT JOIN test_projects p ON p.id = m.project_id WHERE m.project_id = @project_id ORDER BY m.created_at DESC, m.name ASC;";
        var results = new List<LegacyModuleDto>();
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("project_id", projectId);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) results.Add(MapModule(reader));
        return results;
    }

    public async Task<LegacyModuleDto?> GetModuleAsync(string id)
    {
        const string sql = @"SELECT m.id, m.name, COALESCE(m.description, ''), m.project_id, COALESCE(p.name, ''), m.created_at FROM test_modules m LEFT JOIN test_projects p ON p.id = m.project_id WHERE m.id = @id;";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapModule(reader) : null;
    }

    public async Task<LegacyModuleDto> CreateModuleAsync(LegacyModuleCreateRequest request)
    {
        var id = Guid.NewGuid().ToString();
        const string sql = @"INSERT INTO test_modules (id, project_id, name, description, status, automation_space, tags, created_at, updated_at) VALUES (@id, @project_id, @name, @description, 'active', 'web', '[]'::jsonb, NOW(), NOW());";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("project_id", request.ProjectId ?? string.Empty);
        command.Parameters.AddWithValue("name", (request.Name ?? string.Empty).Trim());
        command.Parameters.AddWithValue("description", request.Description?.Trim() ?? string.Empty);
        await command.ExecuteNonQueryAsync();
        return (await GetModuleAsync(id))!;
    }

    public async Task<LegacyModuleDto?> UpdateModuleAsync(string id, LegacyModuleUpdateRequest request)
    {
        const string sql = @"UPDATE test_modules SET name = COALESCE(@name, name), description = COALESCE(@description, description), updated_at = NOW() WHERE id = @id;";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        AddNullableString(command, "name", request.Name?.Trim());
        AddNullableString(command, "description", request.Description?.Trim());
        return await command.ExecuteNonQueryAsync() == 0 ? null : await GetModuleAsync(id);
    }

    public async Task<LegacyModuleDeleteResponse?> DeleteModuleAsync(string moduleId)
    {
        await using var connection = await OpenConnectionAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        var module = await GetModuleInternalAsync(connection, transaction, moduleId);
        if (module is null) return null;

        var caseIds = await LoadIdsAsync(connection, transaction, "SELECT id FROM test_cases WHERE module_id = @module_id;", ("module_id", moduleId));
        var stepCount = await ExecuteCountAsync(connection, transaction, "SELECT COUNT(*) FROM test_steps WHERE test_case_id = ANY(@case_ids);", caseIds);
        var suiteCount = await ExecuteCountAsync(connection, transaction, "SELECT COUNT(*) FROM custom_test_suite_test_cases WHERE test_case_id = ANY(@case_ids);", caseIds);

        await DeleteByIdsAsync(connection, transaction, "DELETE FROM custom_test_suite_test_cases WHERE test_case_id = ANY(@ids);", caseIds);
        await DeleteByIdsAsync(connection, transaction, "DELETE FROM test_steps WHERE test_case_id = ANY(@ids);", caseIds);
        await DeleteByIdsAsync(connection, transaction, "DELETE FROM test_cases WHERE id = ANY(@ids);", caseIds);
        await using (var deleteModule = new NpgsqlCommand("DELETE FROM test_modules WHERE id = @id;", connection, transaction))
        {
            deleteModule.Parameters.AddWithValue("id", moduleId);
            await deleteModule.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();
        return new LegacyModuleDeleteResponse(new LegacyModuleDeletionSummary(module.ModuleName, suiteCount, caseIds.Count, stepCount, 0));
    }

    public async Task<IReadOnlyList<LegacyTestCaseDto>> ListTestCasesAsync(string moduleId)
    {
        const string sql = @"SELECT c.id, c.name, COALESCE(c.description, ''), c.project_id, c.module_id, COALESCE(p.name, ''), COALESCE(m.name, ''), c.created_at, COALESCE(c.status, 'Active'), COALESCE(c.priority, 'Medium') FROM test_cases c LEFT JOIN test_projects p ON p.id = c.project_id LEFT JOIN test_modules m ON m.id = c.module_id WHERE c.module_id = @module_id ORDER BY c.created_at DESC, c.name ASC;";
        var results = new List<LegacyTestCaseDto>();
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("module_id", moduleId);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) results.Add(MapTestCase(reader));
        return results;
    }

    public async Task<IReadOnlyList<LegacyTestCaseDto>> ListReusableTestCasesAsync()
    {
        const string sql = @"SELECT c.id, c.name, COALESCE(c.description, ''), c.project_id, c.module_id, COALESCE(p.name, ''), COALESCE(m.name, ''), c.created_at, COALESCE(c.status, 'Active'), COALESCE(c.priority, 'Medium') FROM test_cases c LEFT JOIN test_projects p ON p.id = c.project_id LEFT JOIN test_modules m ON m.id = c.module_id ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC;";
        var results = new List<LegacyTestCaseDto>();
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) results.Add(MapTestCase(reader));
        return results;
    }

    public async Task<LegacyTestCaseDto?> GetTestCaseAsync(string id)
    {
        const string sql = @"SELECT c.id, c.name, COALESCE(c.description, ''), c.project_id, c.module_id, COALESCE(p.name, ''), COALESCE(m.name, ''), c.created_at, COALESCE(c.status, 'Active'), COALESCE(c.priority, 'Medium') FROM test_cases c LEFT JOIN test_projects p ON p.id = c.project_id LEFT JOIN test_modules m ON m.id = c.module_id WHERE c.id = @id;";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapTestCase(reader) : null;
    }

    public async Task<LegacyTestCaseDto?> CreateTestCaseAsync(LegacyTestCaseUpsertRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ModuleId)) return null;
        var module = await GetModuleAsync(request.ModuleId);
        if (module is null) return null;

        var id = Guid.NewGuid().ToString();
        const string sql = @"INSERT INTO test_cases (id, module_id, project_id, name, description, status, automation_space, test_type, priority, execution_mode, platforms, tags, default_variables, created_at, updated_at) VALUES (@id, @module_id, @project_id, @name, @description, @status, 'web', 'functional', @priority, 'automated', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW());";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("module_id", module.Id);
        command.Parameters.AddWithValue("project_id", module.ProjectId);
        command.Parameters.AddWithValue("name", (request.Name ?? string.Empty).Trim());
        command.Parameters.AddWithValue("description", request.Description?.Trim() ?? string.Empty);
        command.Parameters.AddWithValue("status", NormalizeStatus(request.Status, "Active"));
        command.Parameters.AddWithValue("priority", string.IsNullOrWhiteSpace(request.Priority) ? "Medium" : request.Priority.Trim());
        await command.ExecuteNonQueryAsync();
        return await GetTestCaseAsync(id);
    }

    public async Task<LegacyTestCaseDto?> UpdateTestCaseAsync(string id, LegacyTestCaseUpsertRequest request)
    {
        const string sql = @"UPDATE test_cases SET name = COALESCE(@name, name), description = COALESCE(@description, description), priority = COALESCE(@priority, priority), status = COALESCE(@status, status), module_id = COALESCE(@module_id, module_id), project_id = COALESCE((SELECT project_id FROM test_modules WHERE id = @module_id), project_id), updated_at = NOW() WHERE id = @id;";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        AddNullableString(command, "name", request.Name?.Trim());
        AddNullableString(command, "description", request.Description?.Trim());
        AddNullableString(command, "priority", request.Priority?.Trim());
        AddNullableString(command, "status", request.Status?.Trim());
        AddNullableString(command, "module_id", request.ModuleId?.Trim());
        return await command.ExecuteNonQueryAsync() == 0 ? null : await GetTestCaseAsync(id);
    }

    public async Task<bool> DeleteTestCaseAsync(string id)
    {
        await using var connection = await OpenConnectionAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await using (var deleteMappings = new NpgsqlCommand("DELETE FROM custom_test_suite_test_cases WHERE test_case_id = @id;", connection, transaction))
        {
            deleteMappings.Parameters.AddWithValue("id", id);
            await deleteMappings.ExecuteNonQueryAsync();
        }
        await using (var deleteSteps = new NpgsqlCommand("DELETE FROM test_steps WHERE test_case_id = @id;", connection, transaction))
        {
            deleteSteps.Parameters.AddWithValue("id", id);
            await deleteSteps.ExecuteNonQueryAsync();
        }
        await using var deleteCase = new NpgsqlCommand("DELETE FROM test_cases WHERE id = @id;", connection, transaction);
        deleteCase.Parameters.AddWithValue("id", id);
        var affected = await deleteCase.ExecuteNonQueryAsync();
        await transaction.CommitAsync();
        return affected > 0;
    }

    public async Task<IReadOnlyList<LegacyTestStepDto>> GetTestStepsAsync(string testCaseName, string? projectName, string? moduleName)
    {
        var testCase = await FindTestCaseByNameAsync(testCaseName, projectName, moduleName);
        if (testCase is null) return [];

        const string sql = @"SELECT s.id, c.name, COALESCE(s.step_order, 1), COALESCE(NULLIF(s.description, ''), s.name, ''), COALESCE(s.target, ''), COALESCE(s.action_type, ''), COALESCE(s.assertion_type, ''), COALESCE(s.secondary_action, ''), COALESCE(s.secondary_value, ''), COALESCE(s.input_value, ''), COALESCE(s.test_data::text, '{}'::text), COALESCE(s.bindings::text, '{}'::text) FROM test_steps s INNER JOIN test_cases c ON c.id = s.test_case_id WHERE s.test_case_id = @test_case_id ORDER BY s.step_order ASC, s.created_at ASC;";
        var results = new List<LegacyTestStepDto>();
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("test_case_id", testCase.Id);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) results.Add(MapTestStep(reader));
        return results;
    }

    public async Task<int> SaveTestStepsAsync(string testCaseName, LegacyTestStepBulkSaveRequest request)
    {
        var testCaseId = request.Id;
        if (string.IsNullOrWhiteSpace(testCaseId))
        {
            var testCase = await FindTestCaseByNameAsync(testCaseName, request.ProjectName, request.ModuleName);
            testCaseId = testCase?.Id;
        }
        if (string.IsNullOrWhiteSpace(testCaseId)) return 0;

        var steps = request.Steps ?? [];
        var clearExisting = request.ClearExisting ?? true;
        await using var connection = await OpenConnectionAsync();
        await using var transaction = await connection.BeginTransactionAsync();

        var nextOrder = 1;
        if (!clearExisting)
        {
            await using var maxCommand = new NpgsqlCommand("SELECT COALESCE(MAX(step_order), 0) FROM test_steps WHERE test_case_id = @test_case_id;", connection, transaction);
            maxCommand.Parameters.AddWithValue("test_case_id", testCaseId);
            nextOrder = Convert.ToInt32(await maxCommand.ExecuteScalarAsync() ?? 0, CultureInfo.InvariantCulture) + 1;
        }
        else
        {
            await using var deleteCommand = new NpgsqlCommand("DELETE FROM test_steps WHERE test_case_id = @test_case_id;", connection, transaction);
            deleteCommand.Parameters.AddWithValue("test_case_id", testCaseId);
            await deleteCommand.ExecuteNonQueryAsync();
        }

        const string insertSql = @"INSERT INTO test_steps (id, test_case_id, automation_space, step_order, name, description, action_type, input_value, expected_result, assertion_type, secondary_action, secondary_value, is_enabled, intent, target, test_data, tags, bindings, created_at, updated_at) VALUES (@id, @test_case_id, 'web', @step_order, @name, @description, @action_type, @input_value, '', @assertion_type, @secondary_action, @secondary_value, TRUE, 'action', @target, CAST(@test_data AS jsonb), '[]'::jsonb, CAST(@bindings AS jsonb), NOW(), NOW());";

        foreach (var step in steps)
        {
            var description = step.TestStepDescription?.Trim() ?? string.Empty;
            var elementName = step.ElementName?.Trim() ?? string.Empty;
            var page = step.Page?.Trim() ?? string.Empty;
            var xpath = step.XPath?.Trim() ?? string.Empty;
            var values = step.Values?.Trim() ?? string.Empty;
            var order = clearExisting ? (step.StepNo ?? 0) : 0;
            if (order <= 0) order = nextOrder;
            var testData = JsonSerializer.Serialize(new Dictionary<string, string> { ["page"] = page, ["element_name"] = elementName, ["xpath"] = xpath, ["values"] = values });
            var bindings = JsonSerializer.Serialize(new Dictionary<string, object> { ["web"] = new Dictionary<string, string> { ["xpath"] = xpath } });

            await using var insertCommand = new NpgsqlCommand(insertSql, connection, transaction);
            insertCommand.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
            insertCommand.Parameters.AddWithValue("test_case_id", testCaseId);
            insertCommand.Parameters.AddWithValue("step_order", order);
            insertCommand.Parameters.AddWithValue("name", string.IsNullOrWhiteSpace(description) ? $"Step {order}" : description);
            insertCommand.Parameters.AddWithValue("description", description);
            insertCommand.Parameters.AddWithValue("action_type", step.ActionType?.Trim() ?? "CLICK");
            insertCommand.Parameters.AddWithValue("input_value", values);
            insertCommand.Parameters.AddWithValue("assertion_type", step.AssertionType?.Trim() ?? string.Empty);
            insertCommand.Parameters.AddWithValue("secondary_action", step.SecondaryAction?.Trim() ?? string.Empty);
            insertCommand.Parameters.AddWithValue("secondary_value", step.SecondaryValue?.Trim() ?? string.Empty);
            insertCommand.Parameters.AddWithValue("target", elementName);
            insertCommand.Parameters.AddWithValue("test_data", testData);
            insertCommand.Parameters.AddWithValue("bindings", bindings);
            await insertCommand.ExecuteNonQueryAsync();
            nextOrder = order + 1;
        }

        await transaction.CommitAsync();
        return steps.Count;
    }

    public async Task<IReadOnlyList<LegacyCustomTestSuiteDto>> ListCustomSuitesAsync()
    {
        const string sql = @"SELECT s.id, s.name, COALESCE(s.description, ''), COALESCE(s.icon, 'Settings'), COALESCE(s.gradient, 'from-gray-500 to-slate-500'), COALESCE(s.last_run, 'Never'), COALESCE(s.status, 'active'), s.created_at, s.updated_at, COUNT(stc.test_case_id)::int AS test_count FROM custom_test_suites s LEFT JOIN custom_test_suite_test_cases stc ON stc.suite_id = s.id GROUP BY s.id ORDER BY s.created_at DESC, s.name ASC;";
        var results = new List<LegacyCustomTestSuiteDto>();
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) results.Add(MapCustomSuite(reader));
        return results;
    }

    public async Task<LegacyCustomTestSuiteDto?> GetCustomSuiteAsync(string id)
    {
        const string sql = @"SELECT s.id, s.name, COALESCE(s.description, ''), COALESCE(s.icon, 'Settings'), COALESCE(s.gradient, 'from-gray-500 to-slate-500'), COALESCE(s.last_run, 'Never'), COALESCE(s.status, 'active'), s.created_at, s.updated_at, COUNT(stc.test_case_id)::int AS test_count FROM custom_test_suites s LEFT JOIN custom_test_suite_test_cases stc ON stc.suite_id = s.id WHERE s.id = @id GROUP BY s.id;";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapCustomSuite(reader) : null;
    }

    public async Task<LegacyCustomTestSuiteDto> CreateCustomSuiteAsync(LegacyCustomTestSuiteUpsertRequest request)
    {
        var id = $"suite_{Guid.NewGuid():N}";
        const string sql = @"INSERT INTO custom_test_suites (id, name, description, icon, gradient, status, last_run, created_at, updated_at) VALUES (@id, @name, @description, @icon, @gradient, @status, @last_run, NOW(), NOW());";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("name", (request.Name ?? string.Empty).Trim());
        command.Parameters.AddWithValue("description", request.Description?.Trim() ?? string.Empty);
        command.Parameters.AddWithValue("icon", request.Icon?.Trim() ?? "Settings");
        command.Parameters.AddWithValue("gradient", request.Gradient?.Trim() ?? "from-gray-500 to-slate-500");
        command.Parameters.AddWithValue("status", NormalizeStatus(request.Status, "active"));
        command.Parameters.AddWithValue("last_run", request.LastRun?.Trim() ?? "Never");
        await command.ExecuteNonQueryAsync();
        return (await GetCustomSuiteAsync(id))!;
    }

    public async Task<LegacyCustomTestSuiteDto?> UpdateCustomSuiteAsync(string id, LegacyCustomTestSuiteUpsertRequest request)
    {
        var existing = await GetCustomSuiteAsync(id);
        if (existing is null) return null;

        const string sql = @"UPDATE custom_test_suites SET name = @name, description = @description, icon = @icon, gradient = @gradient, status = @status, last_run = @last_run, updated_at = NOW() WHERE id = @id;";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("name", string.IsNullOrWhiteSpace(request.Name) ? existing.Name : request.Name.Trim());
        command.Parameters.AddWithValue("description", request.Description?.Trim() ?? existing.Description);
        command.Parameters.AddWithValue("icon", request.Icon?.Trim() ?? existing.Icon);
        command.Parameters.AddWithValue("gradient", request.Gradient?.Trim() ?? existing.Gradient);
        command.Parameters.AddWithValue("status", request.Status?.Trim() ?? existing.Status);
        command.Parameters.AddWithValue("last_run", request.LastRun?.Trim() ?? existing.LastRun);
        return await command.ExecuteNonQueryAsync() == 0 ? null : await GetCustomSuiteAsync(id);
    }

    public async Task<bool> DeleteCustomSuiteAsync(string id)
    {
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand("DELETE FROM custom_test_suites WHERE id = @id;", connection);
        command.Parameters.AddWithValue("id", id);
        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<IReadOnlyList<LegacyTestCaseDto>> GetCustomSuiteTestCasesAsync(string suiteId)
    {
        const string sql = @"SELECT c.id, c.name, COALESCE(c.description, ''), c.project_id, c.module_id, COALESCE(p.name, ''), COALESCE(m.name, ''), c.created_at, COALESCE(c.status, 'Active'), COALESCE(c.priority, 'Medium') FROM custom_test_suite_test_cases stc INNER JOIN test_cases c ON c.id = stc.test_case_id LEFT JOIN test_projects p ON p.id = c.project_id LEFT JOIN test_modules m ON m.id = c.module_id WHERE stc.suite_id = @suite_id ORDER BY stc.order_index ASC, c.name ASC;";
        var results = new List<LegacyTestCaseDto>();
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("suite_id", suiteId);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) results.Add(MapTestCase(reader));
        return results;
    }

    public async Task<int> SaveCustomSuiteTestCasesAsync(string suiteId, IReadOnlyList<LegacyTestCaseReference>? testCases)
    {
        var cases = testCases ?? [];
        await using var connection = await OpenConnectionAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await using (var deleteCommand = new NpgsqlCommand("DELETE FROM custom_test_suite_test_cases WHERE suite_id = @suite_id;", connection, transaction))
        {
            deleteCommand.Parameters.AddWithValue("suite_id", suiteId);
            await deleteCommand.ExecuteNonQueryAsync();
        }
        const string insertSql = @"INSERT INTO custom_test_suite_test_cases (suite_id, test_case_id, order_index) VALUES (@suite_id, @test_case_id, @order_index) ON CONFLICT (suite_id, test_case_id) DO UPDATE SET order_index = EXCLUDED.order_index;";
        for (var index = 0; index < cases.Count; index++)
        {
            await using var insertCommand = new NpgsqlCommand(insertSql, connection, transaction);
            insertCommand.Parameters.AddWithValue("suite_id", suiteId);
            insertCommand.Parameters.AddWithValue("test_case_id", cases[index].Id);
            insertCommand.Parameters.AddWithValue("order_index", index + 1);
            await insertCommand.ExecuteNonQueryAsync();
        }
        await using (var updateSuite = new NpgsqlCommand("UPDATE custom_test_suites SET updated_at = NOW() WHERE id = @suite_id;", connection, transaction))
        {
            updateSuite.Parameters.AddWithValue("suite_id", suiteId);
            await updateSuite.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();
        return cases.Count;
    }

    private async Task<LegacyProjectDto?> GetProjectInternalAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string id)
    {
        await using var command = new NpgsqlCommand("SELECT id, name, COALESCE(description, ''), COALESCE(status, 'active'), created_at FROM test_projects WHERE id = @id;", connection, transaction);
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapProject(reader) : null;
    }

    private async Task<LegacyModuleDto?> GetModuleInternalAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string id)
    {
        await using var command = new NpgsqlCommand("SELECT m.id, m.name, COALESCE(m.description, ''), m.project_id, COALESCE(p.name, ''), m.created_at FROM test_modules m LEFT JOIN test_projects p ON p.id = m.project_id WHERE m.id = @id;", connection, transaction);
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapModule(reader) : null;
    }

    private async Task<LegacyTestCaseDto?> FindTestCaseByNameAsync(string testCaseName, string? projectName, string? moduleName)
    {
        const string sql = @"SELECT c.id, c.name, COALESCE(c.description, ''), c.project_id, c.module_id, COALESCE(p.name, ''), COALESCE(m.name, ''), c.created_at, COALESCE(c.status, 'Active'), COALESCE(c.priority, 'Medium') FROM test_cases c LEFT JOIN test_projects p ON p.id = c.project_id LEFT JOIN test_modules m ON m.id = c.module_id WHERE LOWER(c.name) = LOWER(@name) AND (@project_name IS NULL OR LOWER(COALESCE(p.name, '')) = LOWER(@project_name)) AND (@module_name IS NULL OR LOWER(COALESCE(m.name, '')) = LOWER(@module_name)) ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC LIMIT 1;";
        await using var connection = await OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("name", testCaseName);
        AddNullableString(command, "project_name", projectName?.Trim());
        AddNullableString(command, "module_name", moduleName?.Trim());
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapTestCase(reader) : null;
    }

    private async Task<List<string>> LoadIdsAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string sql, params (string Name, string Value)[] parameters)
    {
        var results = new List<string>();
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        foreach (var parameterInfo in parameters) command.Parameters.AddWithValue(parameterInfo.Name, parameterInfo.Value);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) results.Add(reader.GetString(0));
        return results;
    }

    private static async Task<int> ExecuteCountAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string sql, IReadOnlyList<string> ids)
    {
        if (ids.Count == 0) return 0;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        var parameter = command.Parameters.Add("case_ids", NpgsqlDbType.Array | NpgsqlDbType.Varchar);
        parameter.Value = ids.ToArray();
        return Convert.ToInt32(await command.ExecuteScalarAsync() ?? 0, CultureInfo.InvariantCulture);
    }

    private static async Task DeleteByIdsAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string sql, IReadOnlyList<string> ids)
    {
        if (ids.Count == 0) return;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        var parameter = command.Parameters.Add("ids", NpgsqlDbType.Array | NpgsqlDbType.Varchar);
        parameter.Value = ids.ToArray();
        await command.ExecuteNonQueryAsync();
    }

    private static LegacyProjectDto MapProject(NpgsqlDataReader reader)
    {
        var id = reader.GetString(0);
        var name = reader.GetString(1);
        return new LegacyProjectDto(id, name, name, reader.GetString(2), FormatTimestamp(reader.GetValue(4)), "system", reader.GetString(3));
    }

    private static LegacyModuleDto MapModule(NpgsqlDataReader reader)
    {
        var id = reader.GetString(0);
        var name = reader.GetString(1);
        return new LegacyModuleDto(id, name, name, reader.GetString(3), reader.GetString(4), reader.GetString(2), FormatTimestamp(reader.GetValue(5)));
    }

    private static LegacyTestCaseDto MapTestCase(NpgsqlDataReader reader)
    {
        var id = reader.GetString(0);
        return new LegacyTestCaseDto(id, id, reader.GetString(1), reader.GetString(2), reader.IsDBNull(3) ? null : reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetString(4), reader.GetString(5), reader.GetString(6), FormatTimestamp(reader.GetValue(7)), reader.GetString(8), reader.GetString(9), "general");
    }

    private static LegacyTestStepDto MapTestStep(NpgsqlDataReader reader)
    {
        var testData = reader.GetString(10);
        var bindings = reader.GetString(11);
        var page = GetJsonString(testData, "page") ?? string.Empty;
        var elementName = GetJsonString(testData, "element_name") ?? reader.GetString(4);
        var xpath = GetJsonString(bindings, "web", "xpath") ?? GetJsonString(testData, "xpath") ?? string.Empty;
        return new LegacyTestStepDto(reader.GetString(0), reader.GetString(1), reader.GetInt32(2), reader.GetString(3), page, elementName, reader.GetString(5), reader.GetString(6), reader.GetString(7), reader.GetString(8), xpath, reader.GetString(9));
    }

    private static LegacyCustomTestSuiteDto MapCustomSuite(NpgsqlDataReader reader)
    {
        return new LegacyCustomTestSuiteDto(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetInt32(9), reader.GetString(5), reader.GetString(6), FormatTimestamp(reader.GetValue(7)), FormatTimestamp(reader.GetValue(8)));
    }

    private static void AddNullableString(NpgsqlCommand command, string parameterName, string? value)
    {
        command.Parameters.AddWithValue(parameterName, string.IsNullOrWhiteSpace(value) ? DBNull.Value : value);
    }

    private static string NormalizeStatus(string? status, string fallback)
    {
        return string.IsNullOrWhiteSpace(status) ? fallback : status.Trim();
    }

    private static string? GetJsonString(string json, params string[] path)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var document = JsonDocument.Parse(json);
            var current = document.RootElement;
            foreach (var part in path)
            {
                if (current.ValueKind != JsonValueKind.Object || !current.TryGetProperty(part, out current)) return null;
            }
            return current.ValueKind switch
            {
                JsonValueKind.String => current.GetString(),
                JsonValueKind.Number => current.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                _ => null,
            };
        }
        catch
        {
            return null;
        }
    }

    private static string FormatTimestamp(object value)
    {
        return value switch
        {
            DateTimeOffset dto => dto.UtcDateTime.ToString("O", CultureInfo.InvariantCulture),
            DateTime dt => DateTime.SpecifyKind(dt, dt.Kind == DateTimeKind.Unspecified ? DateTimeKind.Utc : dt.Kind).ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
            _ => string.Empty,
        };
    }

    private static string ResolveConnectionString(IConfiguration configuration)
    {
        var explicitConnection = configuration.GetConnectionString("NexCore");
        if (!string.IsNullOrWhiteSpace(explicitConnection)) return explicitConnection;
        foreach (var candidate in new[] { Environment.GetEnvironmentVariable("NEXCORE_DATABASE_URL"), Environment.GetEnvironmentVariable("DATABASE_URL"), Environment.GetEnvironmentVariable("DATABASE_URL_SYNC") })
        {
            if (string.IsNullOrWhiteSpace(candidate)) continue;
            if (candidate.StartsWith("Host=", StringComparison.OrdinalIgnoreCase)) return candidate;
            if (candidate.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) || candidate.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) || candidate.StartsWith("postgresql+asyncpg://", StringComparison.OrdinalIgnoreCase)) return ConvertPostgresUrl(candidate);
        }
        return "Host=localhost;Port=5432;Database=NexCore;Username=postgres;Password=postgres";
    }

    private static string ConvertPostgresUrl(string url)
    {
        var sanitized = url.Replace("postgresql+asyncpg://", "postgresql://", StringComparison.OrdinalIgnoreCase);
        var uri = new Uri(sanitized);
        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = uri.AbsolutePath.Trim('/'),
            Username = Uri.UnescapeDataString(userInfo.ElementAtOrDefault(0) ?? string.Empty),
            Password = Uri.UnescapeDataString(userInfo.ElementAtOrDefault(1) ?? string.Empty),
        };
        return builder.ConnectionString;
    }
}
