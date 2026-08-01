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
    let experience: [ExperienceCard]
    let stackCore: [String]
    let stackAlso: [String]
    let year: Int
    let links: SiteLinks
    /// FormSubmit endpoint the contact form POSTs to; the raw address is
    /// never rendered anywhere in the page.
    let formAction: String
    /// Where FormSubmit redirects after a successful submission.
    let formNext: String
    /// True when the visitor just came back from a successful submission.
    let sent: Bool
}

struct ProjectCard: Encodable {
    let tags: String
    let name: String
    let description: String
    let hasScreenshot: Bool
    let appStoreURL: String?
    let repoURL: String?
}

struct ExperienceCard: Encodable {
    let role: String
    let company: String
    let meta: String
    let description: String
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

        // Project cards are composed from string codes; the card *list*,
        // links, and which cards carry a screenshot placeholder are
        // structure, not copy.
        let projects: [ProjectCard] = [
            ProjectCard(
                tags: s("p1_tags"), name: s("p1_name"), description: s("p1_desc"),
                hasScreenshot: true,
                appStoreURL: "https://apps.apple.com/us/app/id6475695007", repoURL: nil
            ),
            ProjectCard(
                tags: s("p2_tags"), name: s("p2_name"), description: s("p2_desc"),
                hasScreenshot: true,
                appStoreURL: nil, repoURL: nil
            ),
            ProjectCard(
                tags: s("p3_tags"), name: s("p3_name"), description: s("p3_desc"),
                hasScreenshot: false,
                appStoreURL: nil, repoURL: "https://github.com/swift-calendar/icalendarkit"
            ),
            ProjectCard(
                tags: s("p4_tags"), name: s("p4_name"), description: s("p4_desc"),
                hasScreenshot: false,
                appStoreURL: "https://apps.apple.com/us/app/id1346871946", repoURL: nil
            ),
        ]

        // Work history, newest first — copy comes from the strings catalog.
        let experience: [ExperienceCard] = (1...7).map { index in
            ExperienceCard(
                role: s("exp\(index)_role"),
                company: s("exp\(index)_company"),
                meta: s("exp\(index)_meta"),
                description: s("exp\(index)_desc")
            )
        }

        let base = config.siteBaseURL
        let homeURL = absolute(locale.homePath, base: base)
        let sent = (try? req.query.get(String.self, at: "sent")) != nil

        let context = HomeContext(
            locale: locale.htmlLang,
            assetVersion: config.assetVersion,
            canonicalURL: homeURL,
            alternateEN: absolute(AppLocale.en.homePath, base: base),
            alternateES: absolute(AppLocale.es.homePath, base: base),
            otherLocalePath: locale.other.homePath,
            t: t,
            projects: projects,
            experience: experience,
            stackCore: s("stack_core_items").split(separator: "|").map(String.init),
            stackAlso: s("stack_also_items").split(separator: "|").map(String.init),
            year: Calendar(identifier: .gregorian).component(.year, from: Date()),
            links: SiteLinks(
                github: config.githubURL,
                linkedin: config.linkedInURL,
                appStore: config.appStoreURL
            ),
            formAction: config.formSubmitEndpoint,
            formNext: homeURL + "?sent=1",
            sent: sent
        )
        return try await req.view.render("home", context)
    }

    private func absolute(_ path: String, base: String) -> String {
        path == "/" ? base + "/" : base + path
    }
}
