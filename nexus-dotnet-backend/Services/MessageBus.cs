using System.Text.Json;
using NATS.Client.Core;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace Nexus.DotNetBackend.Services;

public interface IMessageBus
{
    /// <summary>connected | connecting | unavailable | not_configured</summary>
    string State { get; }

    NatsJSContext? JetStream { get; }

    Task<bool> PublishAsync(string subject, object payload, CancellationToken cancellationToken = default);
}

/// <summary>
/// NATS JetStream connection for durable jobs and events. PostgreSQL stays the
/// source of truth; when NATS is down publishing is skipped and workers fall back
/// to polling the control plane.
/// </summary>
public sealed class NatsMessageBus : BackgroundService, IMessageBus
{
    public const string RuntimeStream = "NEXUS_RUNTIME";
    public const string AiStream = "NEXUS_AI";

    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(15);

    private readonly string? _url;
    private readonly ILogger<NatsMessageBus> _logger;
    private NatsConnection? _connection;
    private volatile NatsJSContext? _jetStream;
    private volatile string _state;

    public NatsMessageBus(IConfiguration configuration, ILogger<NatsMessageBus> logger)
    {
        _logger = logger;
        _url = configuration["Nats:Url"] ?? Environment.GetEnvironmentVariable("NATS_URL") ?? "nats://localhost:4222";
        if (string.Equals(_url, "disabled", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(_url)) _url = null;
        _state = _url is null ? "not_configured" : "connecting";
    }

    public string State => _state;

    public NatsJSContext? JetStream => _jetStream;

    public async Task<bool> PublishAsync(string subject, object payload, CancellationToken cancellationToken = default)
    {
        var jetStream = _jetStream;
        if (jetStream is null) return false;
        try
        {
            var data = JsonSerializer.SerializeToUtf8Bytes(payload);
            var ack = await jetStream.PublishAsync(subject, data, cancellationToken: cancellationToken);
            ack.EnsureSuccess();
            return true;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            _logger.LogWarning(exception, "NATS publish to {Subject} failed", subject);
            return false;
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (_url is null)
        {
            _logger.LogInformation("NATS disabled; runtime workers will poll the control plane");
            return;
        }

        var loggedFailure = false;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var connection = new NatsConnection(NatsOpts.Default with { Url = _url, Name = "nexus-control-plane" });
                await connection.ConnectAsync();
                var jetStream = new NatsJSContext(connection);
                await EnsureStreamsAsync(jetStream, stoppingToken);
                _connection = connection;
                _jetStream = jetStream;
                _state = "connected";
                _logger.LogInformation("NATS JetStream connected: {Url}", _url);
                // NatsConnection reconnects on its own after the first successful connect.
                await Task.Delay(Timeout.Infinite, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                _state = "unavailable";
                _jetStream = null;
                if (_connection is not null)
                {
                    await _connection.DisposeAsync();
                    _connection = null;
                }
                if (!loggedFailure)
                {
                    _logger.LogWarning("NATS unavailable at {Url} ({Message}); retrying every {Seconds}s", _url, exception.Message, RetryDelay.TotalSeconds);
                    loggedFailure = true;
                }
                try { await Task.Delay(RetryDelay, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken);
        _jetStream = null;
        if (_connection is not null) await _connection.DisposeAsync();
    }

    private static async Task EnsureStreamsAsync(NatsJSContext jetStream, CancellationToken cancellationToken)
    {
        await jetStream.CreateOrUpdateStreamAsync(new StreamConfig(RuntimeStream, ["nexus.runtime.>", "nexus.events.>"])
        {
            MaxAge = TimeSpan.FromDays(7),
            MaxBytes = 1024L * 1024 * 1024,
        }, cancellationToken);
        await jetStream.CreateOrUpdateStreamAsync(new StreamConfig(AiStream, ["ai.jobs", "ai.results", "ai.progress"])
        {
            MaxAge = TimeSpan.FromDays(7),
        }, cancellationToken);
    }
}
