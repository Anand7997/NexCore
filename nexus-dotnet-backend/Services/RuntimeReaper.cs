namespace Nexus.DotNetBackend.Services;

/// <summary>Periodic runtime maintenance: agent liveness, lease expiry, command redelivery, rescheduling.</summary>
public sealed class RuntimeReaper : BackgroundService
{
    private readonly RuntimeScheduler _scheduler;
    private readonly ILogger<RuntimeReaper> _logger;
    private readonly TimeSpan _interval;

    public RuntimeReaper(RuntimeScheduler scheduler, IConfiguration configuration, ILogger<RuntimeReaper> logger)
    {
        _scheduler = scheduler;
        _logger = logger;
        _interval = TimeSpan.FromSeconds(configuration.GetValue("Runtime:MaintenanceIntervalSeconds", 10));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(_interval);
        do
        {
            try
            {
                var result = await _scheduler.RunMaintenanceAsync(stoppingToken);
                if (result.AgentsMarkedOffline + result.CommandsRedelivered + result.Dispatched > 0)
                {
                    _logger.LogInformation("Runtime maintenance: {Offline} agent(s) offline, {Leases} lease(s) expired, {Redelivered} command(s) redelivered, {Dispatched} dispatched",
                        result.AgentsMarkedOffline, result.LeasesExpired, result.CommandsRedelivered, result.Dispatched);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                _logger.LogError(exception, "Runtime maintenance failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }
}
