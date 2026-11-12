/* Skill lists, shared by the site's chips and the CV's skill lines.
 *
 * The items themselves are copy and live in the catalogs; what is here is the
 * one piece of structure they carry (which of them link out), kept in code
 * for the same reason the project URLs are. */

/**
 * Skills that link out. Keyed by the item's first word so the same table
 * serves every locale: "Vapor 4 (server-side Swift)" and "Vapor 4 (Swift
 * côté serveur)" both resolve to vapor.codes. Structure, not copy, so it stays
 * in code next to the project URLs.
 */
const SKILL_LINKS = {
    Vapor: "https://vapor.codes",
};

/** A `|`-separated skill list as `{ text, href }`; `href` is null for the
    plain chips. Shared with the CV so both render targets link the same way. */
export function skillItems(csv) {
    return csv.split("|").map((text) => ({
        text,
        href: SKILL_LINKS[text.split(/[\s(]/, 1)[0]] ?? null,
    }));
}
