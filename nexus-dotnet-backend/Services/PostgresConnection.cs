using Npgsql;

namespace Nexus.DotNetBackend.Services;

public static class PostgresConnection
{
    public static string Resolve(IConfiguration configuration)
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
