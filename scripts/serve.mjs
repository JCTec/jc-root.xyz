#!/usr/bin/env node
/* Serves a build the way the deployed site is served, for local work and for
 * browser-check.mjs.
 *
 * Not a development convenience only: it applies lib/cache-policy.mjs and the
 * edge headers from lib/headers.mjs, so what a browser sees here is what it
 * would see through Cloudflare in front of GitHub Pages. It also mirrors the
 * two behaviours a static host adds on its own — a directory serves its
 * index.html, and a bare `/es` redirects to `/es/`.
 *
 * Usage:  node scripts/serve.mjs [dir] [port]      (defaults: dist 8080)
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

import { cachePolicyForPath } from "../lib/cache-policy.mjs";
import { EDGE_HEADERS } from "../lib/headers.mjs";

const dir = resolve(process.argv[2] ?? "dist");
const port = Number(process.argv[3] ?? 8080);

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".webmanifest": "application/manifest+json",
};

const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    // No traversal out of the served directory, however the path is spelled.
    const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    let file = join(dir, safe);

    const headers = { ...EDGE_HEADERS };
    // Browsers ignore HSTS on plaintext by design; the Vapor middleware
    // withheld it there too rather than advertise a policy to no effect.
    delete headers["Strict-Transport-Security"];

    if (existsSync(file) && statSync(file).isDirectory()) {
        if (!safe.endsWith("/")) {
            // What GitHub Pages does with a bare directory name.
            res.writeHead(301, { Location: `${urlPath}/` });
            res.end();
            return;
        }
        file = join(file, "index.html");
    }

    if (!existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404, { "Content-Type": TYPES[".txt"], ...headers });
        res.end("404\n");
        return;
    }

    res.writeHead(200, {
        "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
        "Cache-Control": cachePolicyForPath(safe),
        ...headers,
    });
    createReadStream(file).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
    console.log(`serving ${dir} → http://127.0.0.1:${port}  (EN)`);
    console.log(`                 http://127.0.0.1:${port}/es/  (ES)`);
});
