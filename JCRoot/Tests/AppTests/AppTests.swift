import Foundation
import Testing
import VaporTesting

@testable import App

/// The default suite is hermetic: no network, no database, no credentials.
/// It prioritizes the site's invariants — locale parity, template/key
/// integrity, headers, and the discovery surfaces — over line coverage.
@Suite("SiteInvariants")
struct SiteInvariantsTests {
    // `withApp` lives in TestSupport.swift, shared with the other suites.

    // MARK: Localization

    @Test("EN and ES string tables keep full key parity with non-empty values")
    func localeParity() async throws {
        try await withApp { app in
            let en = app.strings.table(for: .en)
            let es = app.strings.table(for: .es)
            #expect(!en.isEmpty)
            #expect(Set(en.keys) == Set(es.keys))
            for (key, value) in en {
                #expect(!value.isEmpty, "empty EN value for \(key)")
            }
            for (key, value) in es {
                #expect(!value.isEmpty, "empty ES value for \(key)")
            }
        }
    }

    @Test("Every t.* code referenced in templates exists in the catalog")
    func templateKeysExist() async throws {
        try await withApp { app in
            let en = app.strings.table(for: .en)
            let viewsDir = app.directory.resourcesDirectory + "Views"
            let files = try FileManager.default
                .contentsOfDirectory(atPath: viewsDir)
                .filter { $0.hasSuffix(".leaf") }
            #expect(!files.isEmpty)

            let pattern = try NSRegularExpression(pattern: "#\\(t\\.([A-Za-z0-9_]+)\\)")
            for file in files {
                let contents = try String(contentsOfFile: viewsDir + "/" + file, encoding: .utf8)
                let range = NSRange(contents.startIndex..., in: contents)
                for match in pattern.matches(in: contents, range: range) {
                    guard let keyRange = Range(match.range(at: 1), in: contents) else { continue }
                    let key = String(contents[keyRange])
                    #expect(en[key] != nil, "template \(file) references missing code \(key)")
                }
            }
        }
    }

    @Test(".strings parser accepts the format and rejects malformed lines")
    func stringsParser() throws {
        let parsed = try StringsCatalog.parse(
            """
            // comment
            "a_key" = "A value";
            "b_key" = "Escaped \\"quote\\" and newline\\n";
            """
        )
        #expect(parsed["a_key"] == "A value")
        #expect(parsed["b_key"] == "Escaped \"quote\" and newline\n")

        #expect(throws: (any Error).self) {
            _ = try StringsCatalog.parse(#""missing_semicolon" = "value""#)
        }
        #expect(throws: (any Error).self) {
            _ = try StringsCatalog.parse(
                """
                "dup" = "one";
                "dup" = "two";
                """
            )
        }
    }

    // MARK: Pages

    @Test("Home renders in both locales with security headers and no-cache HTML")
    func homeRenders() async throws {
        try await withApp { app in
            try await app.testing().test(.GET, "/", afterResponse: { res async throws in
                #expect(res.status == .ok)
                let body = res.body.string
                #expect(body.contains("lang=\"en\""))
                #expect(body.contains("hreflang=\"es\""))
                let csp = res.headers.first(name: .contentSecurityPolicy)
                #expect(csp?.contains("default-src 'self'") == true)
                #expect(res.headers.first(name: .cacheControl) == "no-cache, must-revalidate")
                #expect(res.headers.first(name: .xContentTypeOptions) == "nosniff")
            })
            try await app.testing().test(.GET, "es", afterResponse: { res async throws in
                #expect(res.status == .ok)
                #expect(res.body.string.contains("lang=\"es\""))
            })
        }
    }

    @Test("Locale routes carry the right copy — no English leaking into /es")
    func localeCopySeparation() async throws {
        try await withApp { app in
            let en = app.strings.table(for: .en)
            let es = app.strings.table(for: .es)
            try await app.testing().test(.GET, "es", afterResponse: { res async throws in
                let body = res.body.string
                #expect(body.contains(es["work_heading"] ?? ""))
                #expect(!body.contains(en["work_heading"] ?? "@@never@@"))
            })
        }
    }

    // MARK: Discovery + caching

    @Test("robots.txt and sitemap.xml are served with public cache policy")
    func discoverySurfaces() async throws {
        try await withApp { app in
            try await app.testing().test(.GET, "robots.txt", afterResponse: { res async throws in
                #expect(res.status == .ok)
                #expect(res.body.string.contains("Sitemap:"))
                #expect(res.headers.first(name: .cacheControl) == "public, max-age=3600")
            })
            try await app.testing().test(.GET, "sitemap.xml", afterResponse: { res async throws in
                #expect(res.status == .ok)
                #expect(res.body.string.contains("hreflang=\"es\""))
            })
        }
    }

    @Test("Vendored assets are immutable; site CSS/JS revalidate daily")
    func assetCachePolicy() {
        #expect(CachePolicy.value(forPath: "/vendor/bootstrap/css/bootstrap.min.css")
            == "public, max-age=31536000, immutable")
        #expect(CachePolicy.value(forPath: "/icons/favicon.svg")
            == "public, max-age=31536000, immutable")
        #expect(CachePolicy.value(forPath: "/css/site.css")
            == "public, max-age=86400, stale-while-revalidate=604800")
        #expect(CachePolicy.value(forPath: "/js/app.js")
            == "public, max-age=86400, stale-while-revalidate=604800")
        #expect(CachePolicy.value(forPath: "/") == "no-cache, must-revalidate")
        #expect(CachePolicy.value(forPath: "/es") == "no-cache, must-revalidate")
    }

    @Test("Vendored Bootstrap files are actually served")
    func vendoredBootstrap() async throws {
        try await withApp { app in
            try await app.testing().test(.GET, "vendor/bootstrap/css/bootstrap.min.css", afterResponse: { res async throws in
                #expect(res.status == .ok)
                #expect(res.headers.first(name: .cacheControl) == "public, max-age=31536000, immutable")
            })
            try await app.testing().test(.GET, "vendor/bootstrap/js/bootstrap.bundle.min.js", afterResponse: { res async throws in
                #expect(res.status == .ok)
            })
        }
    }

    // MARK: Canonical host

    @Test("Requests on a non-canonical host 301 to the canonical host")
    func canonicalHostRedirect() async throws {
        try await withApp { app in
            // The middleware is only mounted when CANONICAL_HOST is set;
            // exercise the policy object directly so the test needs no env.
            let middleware = CanonicalHostRedirectMiddleware(canonicalHost: "jc-root.xyz")
            app.grouped(middleware).get("canonical-probe") { _ in "ok" }

            try await app.testing().test(.GET, "canonical-probe", headers: ["Host": "www.jc-root.xyz"], afterResponse: { res async throws in
                #expect(res.status == .movedPermanently)
                #expect(res.headers.first(name: .location) == "https://jc-root.xyz/canonical-probe")
            })
            try await app.testing().test(.GET, "canonical-probe", headers: ["Host": "jc-root.xyz"], afterResponse: { res async throws in
                #expect(res.status == .ok)
            })
        }
    }
}
