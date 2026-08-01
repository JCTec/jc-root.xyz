import Vapor

/// Discovery surfaces are generated, not hand-served files, so they always
/// agree with the configured base URL and the real route table.
struct SEOController: Sendable {
    func robots(_ req: Request) async throws -> Response {
        let base = req.application.appConfig.siteBaseURL
        let body = """
        User-agent: *
        Allow: /

        Sitemap: \(base)/sitemap.xml
        """
        return plain(body, as: "text/plain; charset=utf-8")
    }

    func sitemap(_ req: Request) async throws -> Response {
        let base = req.application.appConfig.siteBaseURL
        let en = "\(base)/"
        let es = "\(base)/es"
        let body = """
        <?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
                xmlns:xhtml="http://www.w3.org/1999/xhtml">
          <url>
            <loc>\(en)</loc>
            <xhtml:link rel="alternate" hreflang="en" href="\(en)"/>
            <xhtml:link rel="alternate" hreflang="es" href="\(es)"/>
            <xhtml:link rel="alternate" hreflang="x-default" href="\(en)"/>
          </url>
          <url>
            <loc>\(es)</loc>
            <xhtml:link rel="alternate" hreflang="en" href="\(en)"/>
            <xhtml:link rel="alternate" hreflang="es" href="\(es)"/>
            <xhtml:link rel="alternate" hreflang="x-default" href="\(en)"/>
          </url>
        </urlset>
        """
        return plain(body, as: "application/xml; charset=utf-8")
    }

    private func plain(_ body: String, as contentType: String) -> Response {
        var headers = HTTPHeaders()
        headers.replaceOrAdd(name: .contentType, value: contentType)
        return Response(status: .ok, headers: headers, body: .init(string: body))
    }
}
