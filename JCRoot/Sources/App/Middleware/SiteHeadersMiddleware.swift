import Vapor

/// Cache policy is a pure function of path, so it is reviewable and testable.
/// Vendored/immutable assets rely on `?v=ASSET_VERSION` for cache busting;
/// HTML is never publicly cacheable.
enum CachePolicy {
    static func value(forPath path: String) -> String {
        let p = path.lowercased()
        if p.hasPrefix("/vendor/") || p.hasPrefix("/icons/") || p == "/favicon.ico" {
            return "public, max-age=31536000, immutable"
        }
        if p.hasSuffix(".css") || p.hasSuffix(".js") || p.hasSuffix(".webmanifest") {
            return "public, max-age=86400, stale-while-revalidate=604800"
        }
        if p == "/robots.txt" || p == "/sitemap.xml" || p == "/llms.txt" {
            return "public, max-age=3600"
        }
        return "no-cache, must-revalidate"
    }
}

/// Security and cache headers on every response. The strict CSP is only
/// possible because every asset is first-party — Bootstrap and all JS/CSS are
/// vendored into `Public/`; no CDN, no third-party requests, ever.
struct SiteHeadersMiddleware: AsyncMiddleware {
    private static let csp = [
        "default-src 'self'",
        "script-src 'self'",
        // 'unsafe-inline' for styles only: small inline style attributes in
        // templates. Scripts have no such exemption.
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        // The contact form POSTs to FormSubmit — the single external
        // destination this site allows, and it is allowed narrowly.
        "form-action 'self' https://formsubmit.co",
        "frame-ancestors 'none'",
    ].joined(separator: "; ")

    func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
        let response = try await next.respond(to: request)
        response.headers.replaceOrAdd(name: .contentSecurityPolicy, value: Self.csp)
        response.headers.replaceOrAdd(name: .xContentTypeOptions, value: "nosniff")
        response.headers.replaceOrAdd(name: .xFrameOptions, value: "DENY")
        response.headers.replaceOrAdd(name: HTTPHeaders.Name("Referrer-Policy"), value: "strict-origin-when-cross-origin")
        response.headers.replaceOrAdd(name: HTTPHeaders.Name("Permissions-Policy"), value: "camera=(), microphone=(), geolocation=()")
        response.headers.replaceOrAdd(name: .cacheControl, value: CachePolicy.value(forPath: request.url.path))
        return response
    }
}

/// Keeps traffic on one canonical host (301), which matters for link equity
/// as much as for future cookies. Only active when `CANONICAL_HOST` is set,
/// so localhost and CI are untouched.
struct CanonicalHostRedirectMiddleware: AsyncMiddleware {
    let canonicalHost: String

    func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
        let host = request.headers.first(name: .host) ?? ""
        guard host != canonicalHost, !host.isEmpty else {
            return try await next.respond(to: request)
        }
        var location = "https://\(canonicalHost)\(request.url.path)"
        if let query = request.url.query, !query.isEmpty {
            location += "?\(query)"
        }
        return request.redirect(to: location, redirectType: .permanent)
    }
}
