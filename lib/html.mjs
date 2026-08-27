/* The escaping Leaf did for free.
   Every `#()` interpolation in a Leaf template HTML-escapes `& " ' < >`. A
   JavaScript template literal escapes nothing, so the obligation moves here and
   every interpolation of a catalog value or a config value has to be routed
   through `esc`. The one raw slot in the whole site is the JSON-LD block, and
   that is safe only because `structured-data.mjs` has already escaped it. */

const ENTITIES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

/** HTML-escape a value for interpolation into markup or into an attribute. */
export function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
