namespace Nexus.DotNetBackend.Services;

public sealed record IntentStep(string Intent, IReadOnlyDictionary<string, object?>? Parameters);
public sealed record CompileIntentPlanRequest(string Platform, IntentStep[] Steps, string? ClientSchemaVersion);
public sealed record PlatformReadinessRequest(string Platform, string[]? RequiredCapabilities);

public sealed class IntentCatalogService
{
    public const string SchemaVersion = "1.0.0";
    private static readonly string[] Platforms = ["web", "api", "android", "ios", "desktop"];
    private static readonly string[] Intents = ["navigate", "click", "type", "assertText", "wait", "apiRequest", "desktopClick", "mobileTap"];

    public object Catalog() => new { intents = Intents.Select(name => new { name, schemaVersion = SchemaVersion, platforms = Platforms }) };
    public object PlatformsResponse() => new { platforms = Platforms };
    public object SchemaManifest() => new { schemaVersion = SchemaVersion, minClientSchemaVersion = "1.0.0", compatibility = "backward-compatible" };
    public object MigrationGuide() => new { migrations = Array.Empty<object>() };
    // Legacy fields (platforms/intents/coverage, totalIntents/supportedPlatforms/coveragePercent) are kept for Nexus-Modern;
    // capabilities / platformCoverage etc. are the shape Nexus-Advanced's matrix page consumes.
    public object CapabilityMatrix() => new
    {
        schemaVersion = SchemaVersion,
        platforms = Platforms,
        intents = Intents,
        coverage = Platforms.ToDictionary(p => p, _ => Intents),
        capabilities = Intents.Select(intent => new Dictionary<string, object>
        {
            ["intent"] = intent,
            ["feature"] = intent,
            ["category"] = "core",
            ["description"] = "",
            ["web"] = SupportStatus("web"),
            ["android"] = SupportStatus("android"),
            ["ios"] = SupportStatus("ios"),
            ["desktop"] = SupportStatus("desktop"),
            ["api"] = SupportStatus("api"),
            ["db"] = SupportStatus("db"),
        })
    };
    public object ParityReport() => new { schemaVersion = SchemaVersion, platforms = Platforms, intents = Intents, gaps = Array.Empty<object>() };
    public object ParitySummary() => new
    {
        totalIntents = Intents.Length,
        supportedPlatforms = Platforms.Length,
        coveragePercent = 100,
        overallCoveragePct = 100,
        universalIntents = Intents,
        gapIntents = Array.Empty<string>(),
        webApiOnly = Array.Empty<string>(),
        generatedAt = DateTime.UtcNow,
        platformCoverage = Platforms.Select(platform => new
        {
            platform,
            total = Intents.Length,
            supported = Intents.Length,
            partial = 0,
            unsupported = 0,
            coveragePct = 100,
            adapter = $"{platform}-adapter"
        })
    };

    private static string SupportStatus(string platform) => Platforms.Contains(platform) ? "supported" : "unsupported";

    public object Compile(CompileIntentPlanRequest request)
    {
        var nodes = request.Steps.Select((step, index) => new
        {
            id = $"node_{index + 1}",
            platform = request.Platform,
            intent = step.Intent,
            parameters = step.Parameters ?? new Dictionary<string, object?>(),
            order = index + 1
        }).ToArray();

        return new
        {
            schemaVersion = SchemaVersion,
            platform = request.Platform,
            nodes,
            warnings = Array.Empty<string>()
        };
    }

    public object ValidateAll() => new { status = "ready", platforms = Platforms.Where(p => p is "android" or "ios" or "desktop").ToDictionary(p => p, p => RuntimeStatus(p, [])) };
    public object RuntimeStatus(string platform, string[] requiredCapabilities) => new { platform, ready = true, requiredCapabilities, missingCapabilities = Array.Empty<string>() };
}
