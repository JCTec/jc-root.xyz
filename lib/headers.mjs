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
    // The contact form POSTs to FormSubmit — the single external destination
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

/** Deliberately short while HSTS is being established. A max-age is a promise
    the browser keeps even after we stop making it, so it is raised in steps —
    300 → 86400 → 31536000 — each held long enough to be sure.

    No `includeSubDomains`: `mt-link` and `mt06` are Mailtrap CNAMEs that answer
    over HTTP and fail over HTTPS. No `preload` either: that ships the domain in
    browser binaries and is removed on a timescale of releases, not deploys. */
export const HSTS = "max-age=300";

export const REFERRER_POLICY = "strict-origin-when-cross-origin";
export const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()";

/** Everything the edge has to add, as it should appear in the Cloudflare rule. */
export const EDGE_HEADERS = {
    "Content-Security-Policy": CSP_HEADER,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": REFERRER_POLICY,
    "Permissions-Policy": PERMISSIONS_POLICY,
    "Strict-Transport-Security": HSTS,
};
