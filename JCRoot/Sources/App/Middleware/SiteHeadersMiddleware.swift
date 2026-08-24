import Vapor

/// The scheme the *client* used, as reported by whatever proxy terminated TLS.
///
/// Absence is meaningful and is the safety property this file rests on: nothing
/// upstream terminated TLS for us, so we are being addressed directly — local
/// `swift run`, or the test suite. Demanding HTTPS there would redirect
/// `localhost` into a scheme it cannot serve, so every rule below treats an
/// absent header as "not our business" rather than as "not HTTPS".
///
/// Heroku sets `X-Forwarded-Proto`; when a request crosses more than one proxy
/// the header accumulates a comma-separated list, oldest first. The first entry
/// is the client's original scheme, which is the one we care about.
enum ForwardedProto {
    static func of(_ request: Request) -> String? {
        guard let raw = request.headers.first(name: .xForwardedProto) else { return nil }
        let first = raw.split(separator: ",").first ?? Substring(raw)
        let value = first.trimmingCharacters(in: .whitespaces).lowercased()
        return value.isEmpty ? nil : value
    }

    /// True only when we can see a proxy *and* it reports plaintext. Unknown
    /// stays false: we never upgrade a request we cannot account for.
    static func isPlaintext(_ request: Request) -> Bool {
        guard let proto = of(request) else { return false }
        return proto != "https"
    }

    static func isSecure(_ request: Request) -> Bool {
        of(request) == "https"
    }
}

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

    /// Deliberately short while HSTS is being established. A max-age is a
    /// promise the browser keeps even after we stop making it, so it is raised
    /// in steps — 300 → 86400 → 31536000 — each held long enough to be sure.
    ///
    /// No `includeSubDomains`: `mt-link` and `mt06` are Mailtrap CNAMEs that
    /// answer over HTTP and fail over HTTPS (525, because Cloudflare proxies
    /// them under strict SSL and Mailtrap has no certificate for those names).
    /// Including subdomains here would force those hosts to HTTPS in every
    /// browser that has seen this page and break email link tracking, and
    /// browsers would keep doing it for the full max-age no matter what we
    /// served afterwards. Revisit only once those two records are DNS-only.
    ///
    /// No `preload` either: that ships the domain in browser binaries and is
    /// removed on a timescale of releases, not deploys.
    private static let hsts = "max-age=300"

    func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
        let response = try await next.respond(to: request)
        response.headers.replaceOrAdd(name: .contentSecurityPolicy, value: Self.csp)
        response.headers.replaceOrAdd(name: .xContentTypeOptions, value: "nosniff")
        response.headers.replaceOrAdd(name: .xFrameOptions, value: "DENY")
        response.headers.replaceOrAdd(name: HTTPHeaders.Name("Referrer-Policy"), value: "strict-origin-when-cross-origin")
        response.headers.replaceOrAdd(name: HTTPHeaders.Name("Permissions-Policy"), value: "camera=(), microphone=(), geolocation=()")
        // Only on a response the client received over TLS. Browsers ignore the
        // header on plaintext by design, so sending it there advertises the
        // policy to anyone able to read or rewrite the connection while
        // achieving nothing.
        if ForwardedProto.isSecure(request) {
            response.headers.replaceOrAdd(name: .strictTransportSecurity, value: Self.hsts)
        }
        response.headers.replaceOrAdd(name: .cacheControl, value: CachePolicy.value(forPath: request.url.path))
        return response
    }
}

/// Keeps traffic on one canonical origin — scheme *and* host — in a single 301.
///
/// Both halves are corrected in the same redirect on purpose: `http://www/x`
/// has two things wrong with it, and fixing them in two hops would cost a round
/// trip and leak the intermediate plaintext URL into referrers and history.
///
/// Cloudflare already redirects plaintext at the edge for this zone, so in
/// production this rarely fires. It is here for the cases the edge cannot
/// cover: a direct request to the Heroku origin, and the edge rule being
/// changed or deleted without anyone touching this repository.
///
/// Only mounted when `CANONICAL_HOST` is set, so localhost and CI are untouched.
struct CanonicalURLMiddleware: AsyncMiddleware {
    let canonicalHost: String

    func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
        let host = request.headers.first(name: .host) ?? ""
        let wrongHost = !host.isEmpty && host != canonicalHost
        let wrongScheme = ForwardedProto.isPlaintext(request)

        guard wrongHost || wrongScheme else {
            return try await next.respond(to: request)
        }

        var location = "https://\(canonicalHost)\(request.url.path)"
        if let query = request.url.query, !query.isEmpty {
            location += "?\(query)"
        }
        return request.redirect(to: location, redirectType: .permanent)
    }
}
