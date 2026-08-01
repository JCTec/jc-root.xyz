import Vapor

/// The complete URL surface of the site, legible in one place.
func routes(_ app: Application) throws {
    let pages = PageController()
    let seo = SEOController()

    // Home, one route per locale. Locale is the route, not a cookie —
    // both pages are crawlable and cacheable per path.
    app.get { req in
        try await pages.home(req, locale: .en)
    }
    app.get("es") { req in
        try await pages.home(req, locale: .es)
    }

    // Discovery surfaces.
    app.get("robots.txt", use: seo.robots)
    app.get("sitemap.xml", use: seo.sitemap)
}
