/* The `application/ld+json` payload for the home page, serialized here rather
   than assembled in the template.

   It cannot be built in the template. Every interpolation HTML-escapes
   `& " ' < >`, and HTML parsers do not decode entities inside `<script>` —
   script content is raw text, not markup — so an ampersand or apostrophe in
   any value would reach a crawler as a literal `&amp;` or `&#39;` inside the
   JSON string. Emitting the result raw moves the escaping obligation to this
   file, where `jsonSafe` discharges it.

   A port of Support/StructuredData.swift. */

/** Values that describe the person rather than address the reader.

    These stay in code, unlike anything in `site/strings/`: they are schema.org
    vocabulary and proper nouns, they are never rendered to a visitor, and they
    do not vary by locale — the ES page has always published the same English
    `knowsLanguage` list as the EN one. No place is stated: the site names no
    location for the person. */
const FACTS = {
    knowsAbout: ["Swift", "SwiftUI", "UIKit", "iOS development", "Vapor (server-side Swift)"],
    nationality: [
        { "@type": "Country", name: "Spain" },
        { "@type": "Country", name: "Mexico" },
    ],
    knowsLanguage: ["English", "Spanish", "French"],
    alumniOf: { "@type": "CollegeOrUniversity", name: "Universidad Anáhuac Mérida" },
};

/**
 * The JSON-LD document, ready to be dropped between `<script>` tags.
 *
 * `sameAs` is passed in rather than rebuilt so that the profile links have
 * exactly one source: the site config.
 */
export function homePerson({ name, jobTitle, url, sameAs }) {
    const person = {
        "@context": "https://schema.org",
        "@type": "Person",
        name,
        jobTitle,
        url,
        sameAs,
        knowsAbout: FACTS.knowsAbout,
        nationality: FACTS.nationality,
        alumniOf: FACTS.alumniOf,
        knowsLanguage: FACTS.knowsLanguage,
    };

    // Keys sorted at every level so the byte output is a function of the values
    // alone: two builds with identical content produce an identical page.
    return jsonSafe(sortedStringify(person));
}

/** `JSON.stringify` with object keys emitted in sorted order, recursively. */
export function sortedStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(sortedStringify).join(",")}]`;
    }
    if (value !== null && typeof value === "object") {
        const body = Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${sortedStringify(value[key])}`)
            .join(",");
        return `{${body}}`;
    }
    return JSON.stringify(value);
}

/**
 * `<`, `>` and `&` rewritten as JSON escapes.
 *
 * None of the three is structural in JSON, so replacing every occurrence
 * leaves an equivalent document that parses to exactly the same values. What
 * it buys is that the serialized text can no longer contain the byte sequence
 * `</script`, so no value — however it got there — can terminate the element
 * carrying it. This is why emitting the result raw is safe.
 */
export function jsonSafe(json) {
    return json
        .replaceAll("<", "\\u003c")
        .replaceAll(">", "\\u003e")
        .replaceAll("&", "\\u0026");
}
