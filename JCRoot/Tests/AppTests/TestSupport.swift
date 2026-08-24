import Foundation
import Testing
import VaporTesting

@testable import App

/// Boots a configured application for one test and always tears it down,
/// including on failure. Hermetic: no network, no database, no credentials.
///
/// Shared rather than duplicated per suite so that a change to how the app is
/// configured for tests lands in one place.
func withApp(_ test: (Application) async throws -> Void) async throws {
    let app = try await Application.make(.testing)
    do {
        try await configure(app)
        try await test(app)
    } catch {
        try? await app.asyncShutdown()
        throw error
    }
    try await app.asyncShutdown()
}

/// The HTML a route actually emits, for tests that assert on markup rather
/// than on status codes and headers.
func renderedHTML(_ app: Application, path: String = "/") async throws -> String {
    var html = ""
    try await app.testing().test(.GET, path, afterResponse: { res async throws in
        #expect(res.status == .ok, "\(path) -> \(res.status)")
        html = res.body.string
    })
    return html
}

/// Markup with HTML comments removed.
///
/// Tests that scan for tags must not read commented-out markup: a comment is
/// a legitimate place to *mention* a tag (a note explaining that inline
/// <script> is forbidden, say) without the page actually containing one.
func strippingComments(_ html: String) throws -> String {
    let pattern = try NSRegularExpression(pattern: "<!--[\\s\\S]*?-->")
    let range = NSRange(html.startIndex..., in: html)
    return pattern.stringByReplacingMatches(in: html, range: range, withTemplate: "")
}
