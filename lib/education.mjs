/* Degrees, diplomas and certifications, and spoken languages: shared by the
 * site's sections and the CV's.
 *
 * Same contract as the work history. Rows are numbered in the catalog and
 * counted rather than listed, so a third degree or a fourth language added
 * to en.strings appears on both render targets with no other edit. A field
 * marked optional may be left out of a row (the M.S. names no school yet);
 * it is then null, and the templates leave its line out rather than print
 * the key.
 */

/** How many `<prefix>N_<field>` rows the catalog numbers, 1 through N. */
function rowCount(table, prefix, field) {
    const pattern = new RegExp(`^${prefix}(\\d+)_${field}$`);
    const indices = Object.keys(table)
        .map((key) => key.match(pattern))
        .filter(Boolean)
        .map((match) => Number(match[1]));
    return indices.length === 0 ? 0 : Math.max(...indices);
}

/** Every row of one kind, as `{ field: copy }`. Required fields fall back to
    their own code like the rest of the catalog; optional ones to null. */
function rows(table, prefix, required, optional = []) {
    return Array.from({ length: rowCount(table, prefix, required[0]) }, (_, i) => {
        const code = (field) => `${prefix}${i + 1}_${field}`;
        return Object.fromEntries([
            ...required.map((field) => [field, table[code(field)] ?? code(field)]),
            ...optional.map((field) => [field, table[code(field)] ?? null]),
        ]);
    });
}

/** Degrees, newest first. `status` marks one still under way. */
export function degrees(table) {
    return rows(table, "deg", ["title", "dates"], ["school", "note", "status"]);
}

/* Where a credential can be checked: the event's or the issuer's own page.
   An address is structure, not copy (see projects.mjs), so it lives here rather
   than in three catalogs, keyed by the row's number there. Renumber a row in
   the catalogs and its address moves with it here; build.test.mjs pins each
   linked row's English title so that a forgotten move fails the build instead
   of linking the wrong entry.

   Do iOS keeps the current edition at its root and archives past ones under
   /<year>/ (2025 is at /2025/); once /2026/ exists, both rows point there. */
export const CREDENTIAL_URLS = {
    1: "https://www.do-ios.com/",
    2: "https://www.do-ios.com/now/#2026-workshop-daniel",
};

/** Diplomas, certifications, workshops and conferences, newest first. `note`
    describes what one covered, for the entries whose title alone does not;
    `url` is where to check it, null for the entries with nowhere to point. */
export function credentials(table) {
    return rows(table, "cred", ["type", "title", "issuer", "dates"], ["note"])
        .map((credential, i) => ({ ...credential, url: CREDENTIAL_URLS[i + 1] ?? null }));
}

/** Spoken languages, strongest first: a name and a level (CEFR, or native). */
export function languages(table) {
    return rows(table, "language", ["name", "level"]);
}
