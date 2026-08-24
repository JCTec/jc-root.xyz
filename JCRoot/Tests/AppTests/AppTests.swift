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

    /// Codes assembled at runtime instead of written out, which a static scan
    /// cannot see. Every entry is a claim that some loop builds those keys —
    /// keep the list short, and keep it honest: it is the only way a genuinely
    /// unused key can hide from the test below.
    private static let dynamicKeyPatterns = [
        // PageController builds these for each row of the work history.
        "^exp[0-9]+_(role|company|meta|desc)$",
    ]

    /// Every reference resolves, and every code is referenced.
    ///
    /// The second half is the half that was missing. Checking only that
    /// referenced codes exist cannot see a code that nothing references, which
    /// is exactly how `placeholder_screenshot` and two `*_shot_alt` values
    /// outlived the markup that used them. Swift is scanned as well as the
    /// templates because `s(_:)` falls back to the code itself, so a typo there
    /// renders the key on the page rather than failing.
    @Test("Every string code is referenced, and every reference resolves")
    func stringCodesAndReferencesAgree() async throws {
        try await withApp { app in
            let en = app.strings.table(for: .en)
            let root = app.directory.workingDirectory

            let leafFiles = try sourceFiles(under: root + "Resources/Views", ext: "leaf")
            let swiftFiles = try sourceFiles(under: root + "Sources", ext: "swift")
            #expect(!leafFiles.isEmpty)
            #expect(!swiftFiles.isEmpty)

            var referenced: Set<String> = []
            referenced.formUnion(try codes(in: leafFiles, pattern: "#\\(t\\.([A-Za-z0-9_]+)\\)"))
            referenced.formUnion(try codes(in: swiftFiles, pattern: "s\\(\"([A-Za-z0-9_]+)\"\\)"))

            let missing = referenced.subtracting(en.keys).sorted()
            #expect(missing.isEmpty, "referenced but absent from en.strings: \(missing)")

            let dynamic = try Self.dynamicKeyPatterns.map { try NSRegularExpression(pattern: $0) }
            let unused = Set(en.keys).subtracting(referenced).filter { key in
                !dynamic.contains { rx in
                    rx.firstMatch(in: key, range: NSRange(key.startIndex..., in: key)) != nil
                }
            }.sorted()
            #expect(unused.isEmpty, "defined but referenced by nothing: \(unused)")
        }
    }

    /// Files with the given extension, recursively.
    private func sourceFiles(under directory: String, ext: String) throws -> [String] {
        guard let walker = FileManager.default.enumerator(atPath: directory) else { return [] }
        return walker.compactMap { $0 as? String }
            .filter { $0.hasSuffix("." + ext) }
            .map { directory + "/" + $0 }
    }

    /// Capture group 1 of `pattern`, across every file.
    private func codes(in files: [String], pattern: String) throws -> Set<String> {
        let rx = try NSRegularExpression(pattern: pattern)
        var found: Set<String> = []
        for file in files {
            let contents = try String(contentsOfFile: file, encoding: .utf8)
            let range = NSRange(contents.startIndex..., in: contents)
            for match in rx.matches(in: contents, range: range) {
                if let r = Range(match.range(at: 1), in: contents) {
                    found.insert(String(contents[r]))
                }
            }
        }
        return found
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

    @Test("A wrong host, a plaintext scheme, or both, is corrected in one 301")
    func canonicalURLRedirect() async throws {
        try await withApp { app in
            // The middleware is only mounted when CANONICAL_HOST is set;
            // exercise the policy object directly so the test needs no env.
            let middleware = CanonicalURLMiddleware(canonicalHost: "jc-root.xyz")
            app.grouped(middleware).get("canonical-probe") { _ in "ok" }

            func probe(
                _ headers: HTTPHeaders,
                _ check: @escaping (TestingHTTPResponse) -> Void
            ) async throws {
                try await app.testing().test(.GET, "canonical-probe", headers: headers, afterResponse: { res async throws in
                    check(res)
                })
            }

            // Wrong host, already secure.
            try await probe(["Host": "www.jc-root.xyz", "X-Forwarded-Proto": "https"]) { res in
                #expect(res.status == .movedPermanently)
                #expect(res.headers.first(name: .location) == "https://jc-root.xyz/canonical-probe")
            }
            // Right host, plaintext.
            try await probe(["Host": "jc-root.xyz", "X-Forwarded-Proto": "http"]) { res in
                #expect(res.status == .movedPermanently)
                #expect(res.headers.first(name: .location) == "https://jc-root.xyz/canonical-probe")
            }
            // Both wrong — still exactly one hop, landing on both fixes at once.
            try await probe(["Host": "www.jc-root.xyz", "X-Forwarded-Proto": "http"]) { res in
                #expect(res.status == .movedPermanently)
                #expect(res.headers.first(name: .location) == "https://jc-root.xyz/canonical-probe")
            }
            // Correct origin: no redirect.
            try await probe(["Host": "jc-root.xyz", "X-Forwarded-Proto": "https"]) { res in
                #expect(res.status == .ok)
            }
        }
    }

    /// The guarantee that keeps `swift run` usable. Without a proxy header we
    /// cannot know the client's scheme, and guessing "plaintext" would redirect
    /// localhost to an HTTPS port it does not serve.
    @Test("With no proxy header there is no redirect, whatever the host")
    func noForwardedProtoNeverRedirectsOnScheme() async throws {
        try await withApp { app in
            let middleware = CanonicalURLMiddleware(canonicalHost: "jc-root.xyz")
            app.grouped(middleware).get("canonical-probe") { _ in "ok" }

            try await app.testing().test(.GET, "canonical-probe", headers: ["Host": "jc-root.xyz"], afterResponse: { res async throws in
                #expect(res.status == .ok)
            })
        }
    }

    @Test("A multi-proxy X-Forwarded-Proto is read as the client's scheme")
    func forwardedProtoTakesFirstHop() async throws {
        try await withApp { app in
            let middleware = CanonicalURLMiddleware(canonicalHost: "jc-root.xyz")
            app.grouped(middleware).get("canonical-probe") { _ in "ok" }

            // Oldest hop first: the client spoke plaintext, whatever happened
            // between the proxies afterwards.
            try await app.testing().test(.GET, "canonical-probe", headers: ["Host": "jc-root.xyz", "X-Forwarded-Proto": "http, https"], afterResponse: { res async throws in
                #expect(res.status == .movedPermanently)
            })
            try await app.testing().test(.GET, "canonical-probe", headers: ["Host": "jc-root.xyz", "X-Forwarded-Proto": "https, http"], afterResponse: { res async throws in
                #expect(res.status == .ok)
            })
        }
    }

    @Test("HSTS is sent over TLS and withheld otherwise")
    func hstsOnlyOverTLS() async throws {
        try await withApp { app in
            try await app.testing().test(.GET, "/", headers: ["X-Forwarded-Proto": "https"], afterResponse: { res async throws in
                let hsts = res.headers.first(name: .strictTransportSecurity)
                #expect(hsts?.hasPrefix("max-age=") == true)
                // Not until those Mailtrap CNAMEs stop 525-ing over HTTPS.
                #expect(hsts?.contains("includeSubDomains") == false)
                #expect(hsts?.contains("preload") == false)
            })
            try await app.testing().test(.GET, "/", headers: ["X-Forwarded-Proto": "http"], afterResponse: { res async throws in
                #expect(res.headers.first(name: .strictTransportSecurity) == nil)
            })
            // Local development: no proxy, no header.
            try await app.testing().test(.GET, "/", afterResponse: { res async throws in
                #expect(res.headers.first(name: .strictTransportSecurity) == nil)
            })
        }
    }

    // MARK: Asset version

    @Test("The asset stamp is derived from Public/, and changes when it does")
    func assetVersionTracksContent() async throws {
        let fm = FileManager.default
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("assetversion-\(UUID().uuidString)")
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: dir) }

        let asset = dir.appendingPathComponent("site.css")
        try "a{}".write(to: asset, atomically: true, encoding: .utf8)

        let first = AssetVersion.derive(fromDirectory: dir.path)
        #expect(first != nil)
        // Same bytes, same stamp: a redeploy that changes nothing must not
        // invalidate a year-long immutable cache.
        #expect(AssetVersion.derive(fromDirectory: dir.path) == first)

        try "a{color:red}".write(to: asset, atomically: true, encoding: .utf8)
        #expect(AssetVersion.derive(fromDirectory: dir.path) != first)

        // A rename is a change: the path is mixed into the digest.
        let renamed = dir.appendingPathComponent("other.css")
        try fm.moveItem(at: asset, to: renamed)
        #expect(AssetVersion.derive(fromDirectory: dir.path) != first)

        // Dotfiles are ignored so a stray .DS_Store cannot make a developer's
        // stamp differ from the container's for identical assets.
        let afterRename = AssetVersion.derive(fromDirectory: dir.path)
        try "junk".write(to: dir.appendingPathComponent(".DS_Store"), atomically: true, encoding: .utf8)
        #expect(AssetVersion.derive(fromDirectory: dir.path) == afterRename)

        #expect(AssetVersion.derive(fromDirectory: dir.path + "/does-not-exist") == nil)
    }

    @Test("The running app stamps assets with a real digest, not the fallback")
    func assetVersionIsLive() async throws {
        try await withApp { app in
            let version = app.appConfig.assetVersion
            #expect(version != "dev")
            #expect(version.count == 12)
            #expect(version.allSatisfy { $0.isHexDigit })
        }
    }

    // MARK: Structured data

    @Test("JSON-LD parses, in both locales, with nothing HTML-escaped into it")
    func structuredDataIsValidJSON() async throws {
        try await withApp { app in
            for path in ["/", "/es"] {
                let html = try await renderedHTML(app, path: path)
                let block = try #require(jsonLDBlock(in: html), "no JSON-LD block on \(path)")

                #expect(!block.contains("&amp;"))
                #expect(!block.contains("&#39;"))
                #expect(!block.contains("&quot;"))

                let object = try JSONSerialization.jsonObject(
                    with: Data(block.utf8)
                ) as? [String: Any]
                let json = try #require(object, "JSON-LD on \(path) is not an object")
                #expect(json["@type"] as? String == "Person")
                #expect((json["name"] as? String)?.isEmpty == false)
                #expect((json["sameAs"] as? [String])?.count == 3)
            }
        }
    }

    @Test("A value containing markup cannot terminate the script element")
    func structuredDataEscapesBreakouts() throws {
        let payload = StructuredData.homePerson(
            name: "</script><img src=x onerror=alert(1)>",
            jobTitle: "Ampersand & Angle < Bracket >",
            url: "https://example.com/?a=1&b=2",
            sameAs: ["https://example.com/a&b"]
        )

        // Nothing that could close the element survives serialization.
        #expect(!payload.contains("<"))
        #expect(!payload.contains(">"))
        #expect(!payload.contains("&"))

        // ...and it is still the same data once parsed.
        let json = try #require(
            try JSONSerialization.jsonObject(with: Data(payload.utf8)) as? [String: Any]
        )
        #expect(json["name"] as? String == "</script><img src=x onerror=alert(1)>")
        #expect(json["jobTitle"] as? String == "Ampersand & Angle < Bracket >")
    }

    /// The contents of the `application/ld+json` script element.
    private func jsonLDBlock(in html: String) -> String? {
        let opening = "<script type=\"application/ld+json\">"
        guard let start = html.range(of: opening),
              let end = html.range(of: "</script>", range: start.upperBound..<html.endIndex)
        else { return nil }
        return String(html[start.upperBound..<end.lowerBound])
    }
}
