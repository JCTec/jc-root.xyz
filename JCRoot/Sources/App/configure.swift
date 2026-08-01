import Leaf
import Vapor

/// Boot: config, strings catalog, middleware chain, views, routes.
///
/// Middleware order matters: canonical-host redirect runs first, the header /
/// cache-policy middleware wraps everything (including static files), and the
/// file middleware serves `Public/` last before the router.
public func configure(_ app: Application) async throws {
    let config = AppConfig.load()
    app.appConfig = config

    // All UI copy comes from Resources/Strings/<locale>.strings — never from
    // literals in code or templates. Missing or malformed files fail the boot.
    app.strings = try StringsCatalog.load(fromDirectory: app.directory.resourcesDirectory + "Strings")

    if let host = config.canonicalHost {
        app.middleware.use(CanonicalHostRedirectMiddleware(canonicalHost: host), at: .beginning)
    }
    app.middleware.use(SiteHeadersMiddleware())
    app.middleware.use(FileMiddleware(publicDirectory: app.directory.publicDirectory))

    app.views.use(.leaf)

    try routes(app)
}
