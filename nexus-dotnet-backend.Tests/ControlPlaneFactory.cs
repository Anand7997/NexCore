using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Nexus.DotNetBackend.Services;
using Npgsql;

namespace Nexus.DotNetBackend.Tests;

/// <summary>
/// Hosts the control plane against the local PostgreSQL database inside a throwaway
/// schema. Connection comes from NEXCORE_TEST_DATABASE_URL, DATABASE_URL, or nexus-api/.env.
/// </summary>
public sealed class ControlPlaneFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const int AgentTtlSeconds = 3;
    public const int CommandRedeliverySeconds = 1;

    private readonly string _schema = $"cp_test_{Guid.NewGuid():N}"[..24];
    private readonly string _connectionString;

    public ControlPlaneFactory()
    {
        var url = Environment.GetEnvironmentVariable("NEXCORE_TEST_DATABASE_URL") ?? Environment.GetEnvironmentVariable("DATABASE_URL") ?? ReadDotEnv("DATABASE_URL");
        if (url is not null) Environment.SetEnvironmentVariable("NEXCORE_DATABASE_URL", url);
        var baseConnection = PostgresConnection.Resolve(new ConfigurationBuilder().Build());
        _connectionString = new NpgsqlConnectionStringBuilder(baseConnection) { SearchPath = _schema }.ConnectionString;
    }

    public async Task InitializeAsync()
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE SCHEMA IF NOT EXISTS {_schema}", connection);
        await command.ExecuteNonQueryAsync();
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"DROP SCHEMA IF EXISTS {_schema} CASCADE", connection);
        await command.ExecuteNonQueryAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:NexCore"] = _connectionString,
            ["Nats:Url"] = "disabled",
            ["Runtime:AgentTtlSeconds"] = AgentTtlSeconds.ToString(),
            ["Runtime:CommandRedeliverySeconds"] = CommandRedeliverySeconds.ToString(),
            ["Runtime:MaintenanceIntervalSeconds"] = "3600",
        }));
    }

    public HttpClient CreateTenantClient(string tenantId)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("x-tenant-id", tenantId);
        return client;
    }

    public RuntimeScheduler Scheduler => (RuntimeScheduler)Services.GetService(typeof(RuntimeScheduler))!;

    private static string? ReadDotEnv(string key)
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            var path = Path.Combine(directory.FullName, "nexus-api", ".env");
            if (!File.Exists(path)) continue;
            foreach (var line in File.ReadAllLines(path))
            {
                var trimmed = line.Trim();
                if (trimmed.StartsWith($"{key}=", StringComparison.Ordinal)) return trimmed[(key.Length + 1)..].Trim('"');
            }
        }
        return null;
    }
}

internal static class JsonExtensions
{
    public static async Task<JsonElement> ReadJsonAsync(this HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    public static string Str(this JsonElement element, string property) => element.GetProperty(property).GetString()!;
}
