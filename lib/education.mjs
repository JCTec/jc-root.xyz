/* Degrees, diplomas and certifications, conferences and workshops, and
 * spoken languages: shared by the
 * site's sections and the CV's.
 *
 * Same contract as the work history. Rows are numbered in the catalog and
 * counted rather than listed, so a third degree or a fourth language added
 * to en.strings appears on both render targets with no other edit. A field
 * marked optional may be left out of a row (only the M.S. says how it is
 * taken); it is then null, and the templates leave it out rather than print
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

/* The school's own site, for the degrees that have one to point to. Kept in
   code, keyed by row number, for the same reasons as CREDENTIAL_URLS below;
   build.test.mjs pins each linked row's English title the same way. */
export const DEGREE_URLS = {
    1: "https://nexteducacion.com/",
};

/** Degrees, newest first. `mode` is how and where one is taken ("Online ·
    Madrid, Spain"), `status` marks one still under way, and `url` is the
    school's site, null for the degrees with nowhere to point. */
export function degrees(table) {
    return rows(table, "deg", ["title", "dates"], ["school", "mode", "note", "status"])
        .map((degree, i) => ({ ...degree, url: DEGREE_URLS[i + 1] ?? null }));
}

/* Where a credential or an event can be checked: the event's or the issuer's
   own page. An address is structure, not copy (see projects.mjs), so it lives
   here rather than in three catalogs, keyed by the row's number there. Renumber
   a row in the catalogs and its address moves with it here; build.test.mjs pins
   each linked row's English title so that a forgotten move fails the build
   instead of linking the wrong entry. No diploma or certification has a page
   to point to yet. */
export const CREDENTIAL_URLS = {};

/* Do iOS keeps the current edition at its root and archives past ones under
   /<year>/ (2025 is at /2025/); once /2026/ exists, both rows point there. */
export const EVENT_URLS = {
    1: "https://www.do-ios.com/",
    2: "https://www.do-ios.com/now/#2026-workshop-daniel",
};

/** Diplomas and certifications, newest first. `note` describes what one
    covered, for the entries whose title alone does not; `url` is where to check
    it, null for the entries with nowhere to point. */
export function credentials(table) {
    return rows(table, "cred", ["type", "title", "issuer", "dates"], ["note"])
        .map((credential, i) => ({ ...credential, url: CREDENTIAL_URLS[i + 1] ?? null }));
}

/** Conferences and workshops attended, newest first: the same fields as a
    credential, kept apart from them because attending is not a qualification. */
export function events(table) {
    return rows(table, "event", ["type", "title", "issuer", "dates"], ["note"])
        .map((event, i) => ({ ...event, url: EVENT_URLS[i + 1] ?? null }));
}

/** Spoken languages, strongest first: a name and a level (CEFR, or native). */
export function languages(table) {
    return rows(table, "language", ["name", "level"]);
}
