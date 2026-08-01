import Vapor

/// Everything configurable lives in the environment; nothing here is UI copy.
/// UI copy belongs in `Resources/Strings/` — these are operational values
/// (hosts, versions, destinations) with safe local defaults.
struct AppConfig: Sendable {
    /// When set (e.g. `jc-root.xyz`), requests on any other host 301 to it.
    /// Unset locally so `localhost` works.
    let canonicalHost: String?
    /// Deploy identifier (e.g. the Git SHA) appended to asset URLs as a query
    /// string, so long-lived caches bust on deploy without a build step.
    let assetVersion: String
    /// Absolute base used for canonical URLs, hreflang alternates and the sitemap.
    let siteBaseURL: String
    let contactEmail: String
    let githubURL: String
    let linkedInURL: String
    let appStoreURL: String

    static func load() -> AppConfig {
        let host = Environment.get("CANONICAL_HOST")
        let base = Environment.get("SITE_BASE_URL")
            ?? host.map { "https://\($0)" }
            ?? "http://localhost:8080"
        return AppConfig(
            canonicalHost: host,
            assetVersion: Environment.get("ASSET_VERSION") ?? "dev",
            siteBaseURL: base,
            contactEmail: Environment.get("CONTACT_EMAIL") ?? "juancarlos_tec@proton.me",
            githubURL: Environment.get("GITHUB_URL") ?? "https://github.com/JCTec",
            // TODO: set LINKEDIN_URL / APPSTORE_URL config vars (or replace these
            // defaults) with the real profile URLs before launch.
            linkedInURL: Environment.get("LINKEDIN_URL") ?? "#",
            appStoreURL: Environment.get("APPSTORE_URL") ?? "#"
        )
    }
}

extension Application {
    private struct AppConfigKey: StorageKey {
        typealias Value = AppConfig
    }

    var appConfig: AppConfig {
        get {
            guard let config = storage[AppConfigKey.self] else {
                fatalError("AppConfig not configured. Call configure(_:) first.")
            }
            return config
        }
        set {
            storage[AppConfigKey.self] = newValue
        }
    }
}
