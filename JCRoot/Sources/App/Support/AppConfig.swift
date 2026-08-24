import Foundation
import Vapor

/// The cache-busting stamp appended to asset URLs as `?v=`.
///
/// Derived from the bytes of `Public/` rather than supplied by the deploy, so
/// it cannot disagree with what it names. The previous arrangement had CI write
/// the Git SHA into a Heroku config var *before* pushing the image; that write
/// is itself a release, so the dyno restarted on the old code under the new
/// stamp and served stale assets under a fresh URL for the length of the
/// container build. Anything fetched in that window was cached against the new
/// version — for a day under `/css/` and `/js/`, and for a year under
/// `/vendor/` and `/icons/`, which are `immutable`.
///
/// Computing it here removes the coordination entirely: a byte changes, the URL
/// changes, and every cache in the path — browser and Cloudflare alike — sees a
/// new resource. It also means the stamp is live in local development, where it
/// used to be the constant "dev" and edits to `site.css` went unseen behind a
/// day-long cache.
enum AssetVersion {
    /// Twelve hex characters of a SHA-256 over every shipped file, sorted by
    /// path, with the path itself mixed in so that moving a file counts as a
    /// change. Returns nil if the directory cannot be read, leaving the caller
    /// to fall back rather than silently stamping every deploy identically.
    static func derive(fromDirectory directory: String) -> String? {
        let root = URL(fileURLWithPath: directory, isDirectory: true)
        guard let relativePaths = shippedFiles(under: root), !relativePaths.isEmpty else {
            return nil
        }

        var hasher = SHA256()
        for relativePath in relativePaths.sorted() {
            hasher.update(data: Data(relativePath.utf8))
            guard let contents = try? Data(contentsOf: root.appendingPathComponent(relativePath)) else {
                return nil
            }
            hasher.update(data: contents)
        }
        let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
        return String(digest.prefix(12))
    }

    /// Every regular file under `root`, as paths relative to it.
    ///
    /// Dotfiles are skipped so that a stray `.DS_Store` cannot make a developer's
    /// stamp differ from the one the container computes for identical assets.
    private static func shippedFiles(under root: URL) -> [String]? {
        let manager = FileManager.default
        guard let walker = manager.enumerator(
            at: root,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else {
            return nil
        }

        var paths: [String] = []
        let prefix = root.standardizedFileURL.path.hasSuffix("/")
            ? root.standardizedFileURL.path
            : root.standardizedFileURL.path + "/"
        for case let url as URL in walker {
            guard (try? url.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true else {
                continue
            }
            let path = url.standardizedFileURL.path
            guard path.hasPrefix(prefix) else { continue }
            paths.append(String(path.dropFirst(prefix.count)))
        }
        return paths
    }
}

/// Everything configurable lives in the environment; nothing here is UI copy.
/// UI copy belongs in `Resources/Strings/` — these are operational values
/// (hosts, versions, destinations) with safe local defaults.
struct AppConfig: Sendable {
    /// When set (e.g. `jc-root.xyz`), requests on any other host — or on any
    /// plaintext connection — 301 to it. Unset locally so `localhost` works.
    let canonicalHost: String?
    /// Deploy identifier appended to asset URLs as a query string, so long-lived
    /// caches bust without a build step. Derived from the assets themselves; see
    /// `AssetVersion`.
    let assetVersion: String
    /// Absolute base used for canonical URLs, hreflang alternates and the sitemap.
    let siteBaseURL: String
    let contactEmail: String
    let githubURL: String
    let linkedInURL: String
    let appStoreURL: String
    /// FormSubmit endpoint the contact form POSTs to. The default is the
    /// email-based endpoint (needed once for FormSubmit's activation email);
    /// after activation, set FORMSUBMIT_ENDPOINT to the random alias
    /// FormSubmit provides so the raw address never appears in the HTML.
    let formSubmitEndpoint: String

    /// `publicDirectory` is the directory the stamp is computed from. It is
    /// passed in rather than looked up so that tests can point at a fixture.
    static func load(publicDirectory: String) -> AppConfig {
        let host = Environment.get("CANONICAL_HOST")
        let base = Environment.get("SITE_BASE_URL")
            ?? host.map { "https://\($0)" }
            ?? "http://localhost:8080"
        let contactEmail = Environment.get("CONTACT_EMAIL") ?? "juancarlos_tec@proton.me"
        // The environment still wins, so a deploy can pin the stamp by hand if
        // it ever needs to. "dev" only survives when Public/ is unreadable.
        let assetVersion = Environment.get("ASSET_VERSION")
            ?? AssetVersion.derive(fromDirectory: publicDirectory)
            ?? "dev"
        return AppConfig(
            canonicalHost: host,
            assetVersion: assetVersion,
            siteBaseURL: base,
            contactEmail: contactEmail,
            githubURL: Environment.get("GITHUB_URL") ?? "https://github.com/JCTec",
            linkedInURL: Environment.get("LINKEDIN_URL") ?? "https://www.linkedin.com/in/jctec",
            appStoreURL: Environment.get("APPSTORE_URL")
                ?? "https://apps.apple.com/developer/juan-carlos-estevez-rodriguez/id1346871945",
            formSubmitEndpoint: Environment.get("FORMSUBMIT_ENDPOINT")
                ?? "https://formsubmit.co/\(contactEmail)"
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
