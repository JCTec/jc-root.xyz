/* The security policy the Vapor middleware used to apply on every response.

   GitHub Pages sends none of these and offers no way to add them, so the
   policy is reapplied in two places, and this file is the single source both
   read from:

     - `<meta>` tags in the markup (see templates.mjs), which travel with the
       page and hold even on a direct origin hit; and
     - a Cloudflare Response Header Transform Rule, documented in README.md,
       which is the only way to deliver the ones that have no meta equivalent.

   A port of SiteHeadersMiddleware. */

const CSP_DIRECTIVES = [
    "default-src 'self'",
    "script-src 'self'",
    // 'unsafe-inline' for styles only: small inline style attributes in
    // templates. Scripts have no such exemption.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // The contact form POSTs to FormSubmit, the single external destination
    // this site allows, and it is allowed narrowly.
    "form-action 'self' https://formsubmit.co",
];

/** `frame-ancestors` is silently ignored when a CSP arrives in a `<meta>`
    element; browsers log it and move on. It is therefore delivered only as a
    header, which is the honest reason the meta tag is not sufficient on its
    own and Cloudflare is not optional. */
const FRAME_ANCESTORS = "frame-ancestors 'none'";

export const CSP_META = CSP_DIRECTIVES.join("; ");
export const CSP_HEADER = [...CSP_DIRECTIVES, FRAME_ANCESTORS].join("; ");

/** HSTS is the one header the origin does send.
 *
 * GitHub Pages sets `Strict-Transport-Security: max-age=31556952` on a custom
 * domain with Enforce HTTPS, and it is not configurable. That is a year, which
 * is where the old 300 → 86400 → 31536000 ladder was headed anyway; the ladder
 * existed to avoid promising more than we could keep, and the promise is now
 * being made for us and kept.
 *
 * Crucially it carries no `includeSubDomains`, so the constraint that shaped
 * the original value still holds: `mt-link` and `mt06` are Mailtrap CNAMEs that
 * answer over HTTP and fail over HTTPS, and nothing here forces them to TLS.
 *
 * So the edge deliberately does *not* send this header. Adding it to the rule
 * below would overwrite a year with whatever we wrote, and every value we would
 * plausibly write is shorter: a downgrade dressed as configuration. Left here,
 * named, because "we chose not to send it" and "we forgot" look identical in a
 * header dump six months from now.
 */
export const HSTS_FROM_ORIGIN = "max-age=31556952";

export const REFERRER_POLICY = "strict-origin-when-cross-origin";
export const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()";

/** Everything the edge has to add, as it should appear in the Cloudflare rule.
    No HSTS: the origin already sends a longer one (see HSTS_FROM_ORIGIN). */
export const EDGE_HEADERS = {
    "Content-Security-Policy": CSP_HEADER,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": REFERRER_POLICY,
    "Permissions-Policy": PERMISSIONS_POLICY,
};
