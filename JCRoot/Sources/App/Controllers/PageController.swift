import Foundation
import Vapor

/// Everything the home template needs, resolved server-side. `t` is the full
/// string table for the request's locale; templates reference codes only.
struct HomeContext: Encodable {
    let locale: String
    let assetVersion: String
    let canonicalURL: String
    let alternateEN: String
    let alternateES: String
    let otherLocalePath: String
    let t: [String: String]
    let projects: [ProjectCard]
    let stack: [String]
    let year: Int
    let email: String
    let links: SiteLinks
}

struct ProjectCard: Encodable {
    let tags: String
    let name: String
    let description: String
    let hasScreenshot: Bool
}

struct SiteLinks: Encodable {
    let github: String
    let linkedin: String
    let appStore: String
}

struct PageController: Sendable {
    func home(_ req: Request, locale: AppLocale) async throws -> View {
        let app = req.application
        let config = app.appConfig
        let t = app.strings.table(for: locale)
        // Fallback to the code itself on a missing key — tests enforce that
        // this never happens for keys referenced by templates or built here.
        let s: (String) -> String = { t[$0] ?? $0 }

        // Project cards are composed from string codes; the card *list* and
        // which cards carry a screenshot placeholder are structure, not copy.
        let projects: [ProjectCard] = [
            ProjectCard(tags: s("p1_tags"), name: s("p1_name"), description: s("p1_desc"), hasScreenshot: true),
            ProjectCard(tags: s("p2_tags"), name: s("p2_name"), description: s("p2_desc"), hasScreenshot: true),
            ProjectCard(tags: s("p3_tags"), name: s("p3_name"), description: s("p3_desc"), hasScreenshot: false),
            ProjectCard(tags: s("p4_tags"), name: s("p4_name"), description: s("p4_desc"), hasScreenshot: false),
        ]

        let context = HomeContext(
            locale: locale.htmlLang,
            assetVersion: config.assetVersion,
            canonicalURL: absolute(locale.homePath, base: config.siteBaseURL),
            alternateEN: absolute(AppLocale.en.homePath, base: config.siteBaseURL),
            alternateES: absolute(AppLocale.es.homePath, base: config.siteBaseURL),
            otherLocalePath: locale.other.homePath,
            t: t,
            projects: projects,
            stack: s("stack_items").split(separator: "|").map(String.init),
            year: Calendar(identifier: .gregorian).component(.year, from: Date()),
            email: config.contactEmail,
            links: SiteLinks(
                github: config.githubURL,
                linkedin: config.linkedInURL,
                appStore: config.appStoreURL
            )
        )
        return try await req.view.render("home", context)
    }

    private func absolute(_ path: String, base: String) -> String {
        path == "/" ? base + "/" : base + path
    }
}
