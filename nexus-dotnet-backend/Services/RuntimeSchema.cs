using Npgsql;

namespace Nexus.DotNetBackend.Services;

/// <summary>
/// DDL for the control-plane owned runtime tables. runtime_agents, execution_queue,
/// runtime_leases and audit_logs keep the column layout of the FastAPI SQLAlchemy
/// models so whichever service starts first creates a compatible table.
/// Timestamps are naive UTC, matching the Python models.
/// </summary>
public static class RuntimeSchema
{
    private const string Sql = @"
CREATE TABLE IF NOT EXISTS runtime_agents (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'idle',
    agent_type VARCHAR(50) NOT NULL DEFAULT 'generic',
    endpoint VARCHAR(512),
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    capabilities JSON NOT NULL DEFAULT '[]',
    labels JSON NOT NULL DEFAULT '{}',
    max_concurrency INTEGER NOT NULL DEFAULT 1,
    active_leases INTEGER NOT NULL DEFAULT 0,
    last_heartbeat_at TIMESTAMP,
    registered_at TIMESTAMP NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE runtime_agents ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS ix_runtime_agents_status ON runtime_agents (status);
CREATE INDEX IF NOT EXISTS ix_runtime_agents_tenant_id ON runtime_agents (tenant_id);

CREATE TABLE IF NOT EXISTS execution_queue (
    id VARCHAR(36) PRIMARY KEY,
    execution_id VARCHAR(36) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'queued',
    platform VARCHAR(30) NOT NULL DEFAULT 'web',
    priority INTEGER NOT NULL DEFAULT 100,
    required_capabilities JSON NOT NULL DEFAULT '[]',
    assigned_agent_id VARCHAR(36),
    dispatch_reason TEXT NOT NULL DEFAULT '',
    queued_at TIMESTAMP NOT NULL DEFAULT timezone('utc', now()),
    dispatched_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);
ALTER TABLE execution_queue ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE execution_queue ADD COLUMN IF NOT EXISTS variables JSON NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS ix_execution_queue_status ON execution_queue (status);

CREATE TABLE IF NOT EXISTS runtime_leases (
    id VARCHAR(36) PRIMARY KEY,
    execution_id VARCHAR(36) NOT NULL,
    agent_id VARCHAR(36) NOT NULL REFERENCES runtime_agents(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    platform VARCHAR(30) NOT NULL DEFAULT 'web',
    acquired_at TIMESTAMP NOT NULL DEFAULT timezone('utc', now()),
    released_at TIMESTAMP,
    heartbeat_at TIMESTAMP,
    metadata JSON NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_runtime_leases_execution_id ON runtime_leases (execution_id);
CREATE INDEX IF NOT EXISTS ix_runtime_leases_agent_id ON runtime_leases (agent_id);
CREATE INDEX IF NOT EXISTS ix_runtime_leases_status ON runtime_leases (status);

CREATE TABLE IF NOT EXISTS runtime_agent_commands (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    agent_id VARCHAR(36) NOT NULL REFERENCES runtime_agents(id) ON DELETE CASCADE,
    execution_id VARCHAR(36),
    lease_id VARCHAR(36),
    type VARCHAR(60) NOT NULL,
    payload JSON NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT timezone('utc', now()),
    delivered_at TIMESTAMP,
    acked_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_runtime_agent_commands_agent_status ON runtime_agent_commands (agent_id, status);
CREATE INDEX IF NOT EXISTS ix_runtime_agent_commands_execution_id ON runtime_agent_commands (execution_id);

CREATE TABLE IF NOT EXISTS runtime_agent_events (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    agent_id VARCHAR(36) NOT NULL,
    execution_id VARCHAR(36),
    type VARCHAR(120) NOT NULL,
    payload JSON NOT NULL DEFAULT '{}',
    occurred_at TIMESTAMP NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS ix_runtime_agent_events_agent_id ON runtime_agent_events (agent_id);
CREATE INDEX IF NOT EXISTS ix_runtime_agent_events_execution_id ON runtime_agent_events (execution_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36),
    user_id VARCHAR(255) NOT NULL DEFAULT 'system',
    action VARCHAR(120) NOT NULL,
    resource_type VARCHAR(80) NOT NULL DEFAULT '',
    resource_id VARCHAR(120),
    outcome VARCHAR(30) NOT NULL DEFAULT 'success',
    ip_address VARCHAR(80),
    metadata JSON NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs (created_at);

CREATE TABLE IF NOT EXISTS ai_jobs (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    type VARCHAR(80) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'queued',
    evidence JSON NOT NULL DEFAULT '{}',
    result JSON,
    error TEXT,
    progress DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_by VARCHAR(255) NOT NULL DEFAULT 'system',
    created_at TIMESTAMP NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS ix_ai_jobs_tenant_id ON ai_jobs (tenant_id);
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS publish_attempts INTEGER NOT NULL DEFAULT 0;
";

    public static async Task EnsureAsync(NpgsqlDataSource dataSource, CancellationToken cancellationToken = default)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        // Serialises concurrent schema creation from multiple control-plane instances.
        await using (var lockCommand = new NpgsqlCommand("SELECT pg_advisory_xact_lock(7300100)", connection, transaction))
        {
            await lockCommand.ExecuteNonQueryAsync(cancellationToken);
        }
        await using (var command = new NpgsqlCommand(Sql, connection, transaction))
        {
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);
    }
}
