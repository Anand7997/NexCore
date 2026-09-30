using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Nexus.DotNetBackend.Tests;

public sealed class RuntimeControlPlaneTests : IClassFixture<ControlPlaneFactory>
{
    private readonly ControlPlaneFactory _factory;

    public RuntimeControlPlaneTests(ControlPlaneFactory factory)
    {
        _factory = factory;
    }

    private static string NewTenant() => $"t-{Guid.NewGuid():N}"[..20];

    private static async Task<JsonElement> RegisterAsync(HttpClient client, string? id = null, string[]? capabilities = null, int maxConcurrency = 1)
    {
        var response = await client.PostAsJsonAsync("/api/runtime/agents", new
        {
            id,
            name = "worker",
            agent_type = "python",
            version = "2.0.0",
            capabilities = capabilities ?? ["web", "api"],
            labels = new { host = "test" },
            max_concurrency = maxConcurrency,
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadJsonAsync();
    }

    private static async Task<JsonElement> QueueAsync(HttpClient client, string executionId, string platform = "web") =>
        await (await client.PostAsJsonAsync($"/api/runtime/executions/{executionId}/schedule", new { platform, priority = 50 })).ReadJsonAsync();

    [Fact]
    public async Task Registration_is_an_upsert_with_snake_case_contract()
    {
        var client = _factory.CreateTenantClient(NewTenant());
        var id = Guid.NewGuid().ToString();

        await RegisterAsync(client, id);
        var again = await RegisterAsync(client, id, ["web", "mobile"], 3);

        Assert.Equal(id, again.Str("id"));
        Assert.Equal("idle", again.Str("status"));
        Assert.Equal("python", again.Str("agent_type"));
        Assert.Equal(3, again.GetProperty("max_concurrency").GetInt32());
        Assert.Equal(0, again.GetProperty("active_leases").GetInt32());
        Assert.True(again.TryGetProperty("last_heartbeat_at", out _));

        var agents = await (await client.GetAsync("/api/runtime/agents")).ReadJsonAsync();
        var agent = Assert.Single(agents.EnumerateArray());
        Assert.Equal(["web", "mobile"], agent.GetProperty("capabilities").EnumerateArray().Select(item => item.GetString()));
    }

    [Fact]
    public async Task Heartbeat_for_unknown_agent_returns_404()
    {
        var client = _factory.CreateTenantClient(NewTenant());
        var response = await client.PostAsJsonAsync($"/api/runtime/agents/{Guid.NewGuid()}/heartbeat", new { status = "ready" });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Dispatch_claim_ack_run_and_finish_round_trip()
    {
        var client = _factory.CreateTenantClient(NewTenant());
        var agent = await RegisterAsync(client);
        var agentId = agent.Str("id");
        var executionId = Guid.NewGuid().ToString();

        var queued = await QueueAsync(client, executionId);
        Assert.Equal("dispatched", queued.Str("status"));
        Assert.Equal(agentId, queued.Str("assigned_agent_id"));

        var busy = await (await client.GetAsync($"/api/runtime/agents/{agentId}")).ReadJsonAsync();
        Assert.Equal("busy", busy.Str("status"));
        Assert.Equal(1, busy.GetProperty("active_leases").GetInt32());

        var commands = await (await client.GetAsync($"/api/runtime/agents/{agentId}/commands")).ReadJsonAsync();
        var command = Assert.Single(commands.EnumerateArray());
        Assert.Equal("run_execution", command.Str("type"));
        Assert.Equal(executionId, command.GetProperty("payload").Str("execution_id"));
        Assert.Empty((await (await client.GetAsync($"/api/runtime/agents/{agentId}/commands")).ReadJsonAsync()).EnumerateArray());

        var ack = await (await client.PostAsJsonAsync($"/api/runtime/agents/{agentId}/commands/{command.Str("id")}/ack", new { status = "completed" })).ReadJsonAsync();
        Assert.Equal("completed", ack.Str("status"));

        var running = await (await client.PostAsync($"/api/runtime/executions/{executionId}/running", null)).ReadJsonAsync();
        Assert.Equal("running", running.Str("status"));

        var leases = await (await client.GetAsync($"/api/runtime/leases?agent_id={agentId}&status=active")).ReadJsonAsync();
        Assert.Single(leases.EnumerateArray());

        var finished = await (await client.PostAsJsonAsync($"/api/runtime/executions/{executionId}/finish", new { status = "completed" })).ReadJsonAsync();
        Assert.Equal("completed", finished.Str("status"));

        var idle = await (await client.GetAsync($"/api/runtime/agents/{agentId}")).ReadJsonAsync();
        Assert.Equal("idle", idle.Str("status"));
        Assert.Equal(0, idle.GetProperty("active_leases").GetInt32());
        Assert.Empty((await (await client.GetAsync($"/api/runtime/leases?agent_id={agentId}&status=active")).ReadJsonAsync()).EnumerateArray());
    }

    [Fact]
    public async Task Work_waits_for_a_capable_agent_in_the_same_tenant()
    {
        var tenant = NewTenant();
        var client = _factory.CreateTenantClient(tenant);
        var otherTenant = _factory.CreateTenantClient(NewTenant());
        await RegisterAsync(otherTenant, capabilities: ["mobile"]);
        await RegisterAsync(client, capabilities: ["web"]);
        var executionId = Guid.NewGuid().ToString();

        var queued = await QueueAsync(client, executionId, "mobile");
        Assert.Equal("queued", queued.Str("status"));
        Assert.Equal("No compatible runtime agent is currently available.", queued.Str("dispatch_reason"));

        var mobile = await RegisterAsync(client, capabilities: ["mobile"]);
        var item = await (await client.GetAsync($"/api/runtime/executions/{executionId}")).ReadJsonAsync();
        Assert.Equal("dispatched", item.Str("status"));
        Assert.Equal(mobile.Str("id"), item.Str("assigned_agent_id"));
    }

    [Fact]
    public async Task Silent_agent_goes_offline_and_unstarted_work_is_requeued()
    {
        var client = _factory.CreateTenantClient(NewTenant());
        var lost = await RegisterAsync(client);
        var executionId = Guid.NewGuid().ToString();
        Assert.Equal("dispatched", (await QueueAsync(client, executionId)).Str("status"));

        await Task.Delay(TimeSpan.FromSeconds(ControlPlaneFactory.AgentTtlSeconds + 0.5));
        var result = await _factory.Scheduler.RunMaintenanceAsync();
        Assert.True(result.AgentsMarkedOffline >= 1);

        var agent = await (await client.GetAsync($"/api/runtime/agents/{lost.Str("id")}")).ReadJsonAsync();
        Assert.Equal("offline", agent.Str("status"));
        Assert.Equal(0, agent.GetProperty("active_leases").GetInt32());
        var item = await (await client.GetAsync($"/api/runtime/executions/{executionId}")).ReadJsonAsync();
        Assert.Equal("queued", item.Str("status"));
        var expired = await (await client.GetAsync($"/api/runtime/leases?agent_id={lost.Str("id")}&status=expired")).ReadJsonAsync();
        Assert.Single(expired.EnumerateArray());

        var replacement = await RegisterAsync(client);
        item = await (await client.GetAsync($"/api/runtime/executions/{executionId}")).ReadJsonAsync();
        Assert.Equal("dispatched", item.Str("status"));
        Assert.Equal(replacement.Str("id"), item.Str("assigned_agent_id"));
    }

    [Fact]
    public async Task Unacknowledged_command_is_redelivered()
    {
        var client = _factory.CreateTenantClient(NewTenant());
        var agentId = (await RegisterAsync(client)).Str("id");
        await QueueAsync(client, Guid.NewGuid().ToString());
        var first = Assert.Single((await (await client.GetAsync($"/api/runtime/agents/{agentId}/commands")).ReadJsonAsync()).EnumerateArray());

        await Task.Delay(TimeSpan.FromSeconds(ControlPlaneFactory.CommandRedeliverySeconds + 0.3));
        await client.PostAsJsonAsync($"/api/runtime/agents/{agentId}/heartbeat", new { status = "ready" });
        await _factory.Scheduler.RunMaintenanceAsync();

        var second = Assert.Single((await (await client.GetAsync($"/api/runtime/agents/{agentId}/commands")).ReadJsonAsync()).EnumerateArray());
        Assert.Equal(first.Str("id"), second.Str("id"));
        Assert.Equal(2, second.GetProperty("attempts").GetInt32());
    }

    [Fact]
    public async Task Cancel_before_and_after_the_worker_claims_the_run()
    {
        var client = _factory.CreateTenantClient(NewTenant());
        var agentId = (await RegisterAsync(client, maxConcurrency: 2)).Str("id");

        var unclaimed = Guid.NewGuid().ToString();
        await QueueAsync(client, unclaimed);
        var cancelled = await (await client.PostAsync($"/api/runtime/executions/{unclaimed}/cancel", null)).ReadJsonAsync();
        Assert.Equal("cancelled", cancelled.Str("status"));

        // The withdrawn run command is not delivered; only the cancel notice is.
        var notices = await (await client.GetAsync($"/api/runtime/agents/{agentId}/commands")).ReadJsonAsync();
        Assert.All(notices.EnumerateArray(), command => Assert.Equal("cancel_execution", command.Str("type")));

        var claimed = Guid.NewGuid().ToString();
        await QueueAsync(client, claimed);
        Assert.Single((await (await client.GetAsync($"/api/runtime/agents/{agentId}/commands")).ReadJsonAsync()).EnumerateArray());
        var cancelling = await (await client.PostAsync($"/api/runtime/executions/{claimed}/cancel", null)).ReadJsonAsync();
        Assert.Equal("cancelling", cancelling.Str("status"));
        var cancel = Assert.Single((await (await client.GetAsync($"/api/runtime/agents/{agentId}/commands")).ReadJsonAsync()).EnumerateArray());
        Assert.Equal("cancel_execution", cancel.Str("type"));
        Assert.Equal(claimed, cancel.Str("execution_id"));
    }

    [Fact]
    public async Task Ai_jobs_are_persisted_and_accept_results()
    {
        var client = _factory.CreateTenantClient(NewTenant());
        var job = await (await client.PostAsJsonAsync("/api/ai/jobs", new { type = "root_cause_analysis", evidence = new { error = "boom" } })).ReadJsonAsync();
        var jobId = job.Str("id");
        Assert.Equal("queued", job.Str("status"));

        var done = await (await client.PostAsJsonAsync("/api/ai/results", new { jobId, status = "completed", result = new { summary = "ok" } })).ReadJsonAsync();
        Assert.Equal("completed", done.Str("status"));
        var fetched = await (await client.GetAsync($"/api/ai/jobs/{jobId}")).ReadJsonAsync();
        Assert.Equal("ok", fetched.GetProperty("result").Str("summary"));
    }
}
