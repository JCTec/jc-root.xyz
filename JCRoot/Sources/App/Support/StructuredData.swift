import Foundation

/// The `application/ld+json` payload for the home page, serialized here rather
/// than assembled in the template.
///
/// It cannot be built in Leaf. Every `#()` interpolation HTML-escapes
/// `& " ' < >`, and HTML parsers do not decode entities inside `<script>` —
/// script content is raw text, not markup — so an ampersand or apostrophe in
/// any value would reach a crawler as a literal `&amp;` or `&#39;` inside the
/// JSON string. The block is currently correct only because none of the values
/// happens to contain one of those five characters; a job title with an "&" in
/// it would have published mangled structured data with nothing failing.
///
/// Emitting the result with `#unsafeHTML` moves the escaping obligation from
/// Leaf to this file, where `jsonSafe(_:)` discharges it.
enum StructuredData {
    /// Values that describe the person rather than address the reader.
    ///
    /// These stay in code, unlike anything in `Resources/Strings/`: they are
    /// schema.org vocabulary and proper nouns, they are never rendered to a
    /// visitor, and they do not vary by locale — the ES page has always
    /// published the same English `knowsLanguage` list as the EN one. Changing
    /// that is a separate decision about how crawlers should see the two pages,
    /// not a side effect of fixing the escaping.
    private enum Facts {
        static let knowsAbout = ["Swift", "SwiftUI", "UIKit", "iOS development"]
        static let nationality = "Spanish"
        static let knowsLanguage = ["English", "Spanish", "French"]
        static let alumniOf = Entity(type: "CollegeOrUniversity", name: "Universidad Anáhuac Mérida")
        static let homeLocation = Entity(type: "Place", name: "Barcelona, Spain")
    }

    private struct Entity: Encodable {
        let type: String
        let name: String

        enum CodingKeys: String, CodingKey {
            case type = "@type"
            case name
        }
    }

    private struct Person: Encodable {
        let context: String
        let type: String
        let name: String
        let jobTitle: String
        let url: String
        let sameAs: [String]
        let knowsAbout: [String]
        let nationality: String
        let alumniOf: Entity
        let knowsLanguage: [String]
        let homeLocation: Entity

        enum CodingKeys: String, CodingKey {
            case context = "@context"
            case type = "@type"
            case name, jobTitle, url, sameAs, knowsAbout
            case nationality, alumniOf, knowsLanguage, homeLocation
        }
    }

    /// The JSON-LD document, ready to be dropped between `<script>` tags.
    ///
    /// `sameAs` is passed in rather than rebuilt so that the profile links have
    /// exactly one source: `AppConfig`.
    static func homePerson(
        name: String,
        jobTitle: String,
        url: String,
        sameAs: [String]
    ) -> String {
        let person = Person(
            context: "https://schema.org",
            type: "Person",
            name: name,
            jobTitle: jobTitle,
            url: url,
            sameAs: sameAs,
            knowsAbout: Facts.knowsAbout,
            nationality: Facts.nationality,
            alumniOf: Facts.alumniOf,
            knowsLanguage: Facts.knowsLanguage,
            homeLocation: Facts.homeLocation
        )

        let encoder = JSONEncoder()
        // Sorted so the byte output is a function of the values alone: two
        // deploys with identical content produce an identical page.
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]

        guard let data = try? encoder.encode(person),
              let json = String(data: data, encoding: .utf8)
        else {
            // An empty graph is ignored by crawlers. A half-written one is not,
            // and neither is a template that fails to render.
            return "{}"
        }
        return jsonSafe(json)
    }

    /// `<`, `>` and `&` rewritten as JSON escapes.
    ///
    /// None of the three is structural in JSON, so replacing every occurrence
    /// leaves an equivalent document that parses to exactly the same values.
    /// What it buys is that the serialized text can no longer contain the byte
    /// sequence `</script`, so no value — however it got there — can terminate
    /// the element carrying it. This is the standard treatment for JSON
    /// embedded in HTML, and it is why emitting the result raw is safe.
    private static func jsonSafe(_ json: String) -> String {
        json
            .replacingOccurrences(of: "<", with: "\\u003c")
            .replacingOccurrences(of: ">", with: "\\u003e")
            .replacingOccurrences(of: "&", with: "\\u0026")
    }
}
