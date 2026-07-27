using System.Collections.Concurrent;
using Nexus.DotNetBackend.Contracts;

namespace Nexus.DotNetBackend.Services;

public sealed class RuntimeScheduler
{
    private readonly ConcurrentDictionary<string, RuntimeAgentView> _agents = new();
    private readonly ConcurrentDictionary<string, ConcurrentQueue<RuntimeAgentCommand>> _commands = new();
    private readonly ConcurrentDictionary<string, RuntimeQueueItem> _queue = new();
    private readonly RequestContext _requestContext;

    public RuntimeScheduler(RequestContext requestContext)
    {
        _requestContext = requestContext;
    }

    public RuntimeAgentView Register(RuntimeAgentRegistration command)
    {
        var now = DateTimeOffset.UtcNow;
        var agentId = string.IsNullOrWhiteSpace(command.AgentId) ? $"agent_{Guid.NewGuid():N}" : command.AgentId;
        var agent = new RuntimeAgentView(
            agentId,
            command.Name,
            command.Capabilities,
            command.Platforms,
            command.Version,
            _requestContext.TenantId,
            now,
            now,
            now.AddSeconds(45),
            "online");

        _agents[agentId] = agent;
        _commands.TryAdd(agentId, new ConcurrentQueue<RuntimeAgentCommand>());
        return agent;
    }

    public RuntimeAgentView? Heartbeat(string agentId)
    {
        if (!_agents.TryGetValue(agentId, out var agent)) return null;
        var now = DateTimeOffset.UtcNow;
        var updated = agent with { LastHeartbeatAt = now, LeaseExpiresAt = now.AddSeconds(45), Status = "online" };
        _agents[agentId] = updated;
        return updated;
    }

    public IReadOnlyList<RuntimeAgentCommand> GetPendingCommands(string agentId)
    {
        if (!_commands.TryGetValue(agentId, out var queue)) return [];
        var commands = new List<RuntimeAgentCommand>();
        while (queue.TryDequeue(out var command)) commands.Add(command);
        return commands;
    }

    public object PublishEvent(string agentId, RuntimeAgentEvent @event)
    {
        Heartbeat(agentId);
        return new
        {
            accepted = true,
            agentId,
            eventType = @event.Type,
            occurredAt = @event.OccurredAt ?? DateTimeOffset.UtcNow
        };
    }

    public RuntimeQueueItem Enqueue(RuntimeQueueCommand command)
    {
        var item = new RuntimeQueueItem(
            $"queue_{Guid.NewGuid():N}",
            command.TenantId ?? _requestContext.TenantId,
            command.ExecutionId,
            command.Platform,
            command.RequiredCapabilities,
            command.Variables ?? new Dictionary<string, object?>(),
            "queued",
            DateTimeOffset.UtcNow);

        _queue[item.Id] = item;
        AssignToMatchingAgent(item);
        return item;
    }

    public IReadOnlyList<RuntimeAgentView> ListAgents() => _agents.Values.OrderByDescending(a => a.LastHeartbeatAt).ToArray();

    public IReadOnlyList<RuntimeQueueItem> ListQueue() => _queue.Values.OrderByDescending(q => q.CreatedAt).ToArray();

    private void AssignToMatchingAgent(RuntimeQueueItem item)
    {
        var agent = _agents.Values
            .Where(candidate => candidate.TenantId == item.TenantId && candidate.Status == "online")
            .FirstOrDefault(candidate => item.RequiredCapabilities.All(required =>
                candidate.Capabilities.Contains(required, StringComparer.OrdinalIgnoreCase)));

        if (agent is null) return;

        var command = new RuntimeAgentCommand(
            $"cmd_{Guid.NewGuid():N}",
            item.ExecutionId,
            "run_execution",
            new Dictionary<string, object?>
            {
                ["platform"] = item.Platform,
                ["variables"] = item.Variables
            },
            DateTimeOffset.UtcNow);

        _commands.GetOrAdd(agent.AgentId, _ => new ConcurrentQueue<RuntimeAgentCommand>()).Enqueue(command);
        _queue[item.Id] = item with { Status = "assigned" };
    }
}
