import Foundation
import Testing
import VaporTesting

@testable import App

/// Invariants about the markup the server actually emits.
///
/// The existing suite checks status codes, headers and copy; none of it looks
/// at what the page tells a browser to load or how it tells it to lay out.
/// Every failure these tests describe has already happened once: an asset that
/// is referenced but not deployed, an inline script the CSP forbids, and an
/// element whose layout lived only in a stylesheet cached separately from the
/// markup that needs it.
@Suite("RenderedPage")
struct RenderedPageTests {

    /// Same-origin asset URLs the page tells the browser to fetch. Routes
    /// (`/`, `/es`) and in-page anchors are excluded: only paths with a file
    /// extension are assets.
    private func assetReferences(in rawHTML: String) throws -> [String] {
        let html = try strippingComments(rawHTML)
        let pattern = try NSRegularExpression(pattern: "(?:href|src)=\"(/[^\"]+)\"")
        let range = NSRange(html.startIndex..., in: html)
        return pattern.matches(in: html, range: range).compactMap { match in
            guard let r = Range(match.range(at: 1), in: html) else { return nil }
            let ref = String(html[r])
            let path = String(ref.split(separator: "?").first ?? "")
            return (path as NSString).pathExtension.isEmpty ? nil : ref
        }
    }

    @Test("Every asset the page references is actually served")
    func referencedAssetsResolve() async throws {
        try await withApp { app in
            let html = try await renderedHTML(app)
            let refs = try assetReferences(in: html)
            // Guard the regex itself: a page that suddenly references nothing
            // would make every assertion below vacuous.
            #expect(refs.count >= 5, "expected several asset references, found \(refs.count)")

            for ref in refs {
                try await app.testing().test(.GET, ref, afterResponse: { res async throws in
                    #expect(res.status == .ok, "page references \(ref) but it serves \(res.status)")
                })
            }
        }
    }

    @Test("Long-cached assets are always referenced with a ?v= buster")
    func longCachedAssetsAreVersioned() async throws {
        try await withApp { app in
            let html = try await renderedHTML(app)
            for ref in try assetReferences(in: html) {
                let path = String(ref.split(separator: "?").first ?? "")
                let policy = CachePolicy.value(forPath: path)
                guard policy.contains("max-age=86400") || policy.contains("immutable") else { continue }
                #expect(
                    ref.contains("?v="),
                    "\(path) is served \(policy) but referenced without a cache buster"
                )
            }
        }
    }

    @Test("No inline executable <script> — the CSP is script-src 'self'")
    func noInlineExecutableScript() async throws {
        try await withApp { app in
            let html = try strippingComments(try await renderedHTML(app))
            let pattern = try NSRegularExpression(pattern: "<script([^>]*)>")
            let range = NSRange(html.startIndex..., in: html)
            let matches = pattern.matches(in: html, range: range)
            #expect(!matches.isEmpty, "expected the page to carry <script> tags")

            for match in matches {
                guard let r = Range(match.range(at: 1), in: html) else { continue }
                let attributes = String(html[r])
                // A src'd script is fetched from 'self'. A ld+json block is a
                // data block, never executed. Anything else is inline JS and
                // the browser will refuse to run it.
                let allowed = attributes.contains("src=")
                    || attributes.contains("application/ld+json")
                #expect(allowed, "inline <script\(attributes)> would be blocked by the CSP")
            }
        }
    }

    /// Regression test for 57783ef.
    ///
    /// HTML is served `no-cache`, but CSS is `max-age=86400` keyed on a
    /// `?v=ASSET_VERSION` that is the constant "dev" outside CI. So markup and
    /// stylesheet can disagree by up to a day, and a decorative overlay whose
    /// `position` lives only in the stylesheet becomes a viewport-sized block
    /// in normal flow that pushes the page down. Layout for these elements has
    /// to travel with the markup.
    @Test("Decorative canvases carry their layout inline, not in a cached stylesheet")
    func decorativeOverlaysCarryLayoutInline() async throws {
        try await withApp { app in
            let html = try strippingComments(try await renderedHTML(app))
            let pattern = try NSRegularExpression(pattern: "<canvas([^>]*)>")
            let range = NSRange(html.startIndex..., in: html)
            let matches = pattern.matches(in: html, range: range)
            #expect(!matches.isEmpty, "expected the background canvas in the markup")

            for match in matches {
                guard let r = Range(match.range(at: 1), in: html) else { continue }
                let attributes = String(html[r])
                let style = attributes.replacingOccurrences(of: " ", with: "")
                #expect(
                    style.contains("position:fixed") || style.contains("position:absolute"),
                    "<canvas\(attributes)> must declare position inline; a stale stylesheet would leave it in normal flow"
                )
                #expect(
                    style.contains("pointer-events:none"),
                    "<canvas\(attributes)> must be inert inline; a stale stylesheet would let it swallow clicks"
                )
                #expect(
                    attributes.contains("aria-hidden=\"true\""),
                    "<canvas\(attributes)> is decoration and must be hidden from assistive tech"
                )
            }
        }
    }
}
