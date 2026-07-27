using Nexus.DotNetBackend.Contracts;

namespace Nexus.DotNetBackend.Services;

public sealed class RequestContext
{
    public const string TenantHeader = "x-tenant-id";
    public const string SubjectHeader = "x-user-id";
    public const string EmailHeader = "x-user-email";
    public const string RolesHeader = "x-user-roles";

    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IConfiguration _configuration;

    public RequestContext(IHttpContextAccessor httpContextAccessor, IConfiguration configuration)
    {
        _httpContextAccessor = httpContextAccessor;
        _configuration = configuration;
    }

    public string TenantId
    {
        get
        {
            var httpContext = _httpContextAccessor.HttpContext;
            var configuredDefault = _configuration["Nexus:DefaultTenantId"] ?? "default";
            return ReadHeader(httpContext, TenantHeader) ?? configuredDefault;
        }
    }

    public Principal Principal
    {
        get
        {
            var httpContext = _httpContextAccessor.HttpContext;
            var tenantId = TenantId;
            var subject = ReadHeader(httpContext, SubjectHeader) ?? "local-dev-user";
            var email = ReadHeader(httpContext, EmailHeader);
            var roles = (ReadHeader(httpContext, RolesHeader) ?? "admin")
                .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            return new Principal(subject, email, roles, tenantId);
        }
    }

    private static string? ReadHeader(HttpContext? context, string header)
    {
        if (context is null) return null;
        return context.Request.Headers.TryGetValue(header, out var value) ? value.ToString() : null;
    }
}
