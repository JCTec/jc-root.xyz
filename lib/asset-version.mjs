/* The cache-busting stamp appended to asset URLs as `?v=`.

   Derived from the bytes of `site/public/` rather than supplied by the deploy,
   so it cannot disagree with what it names: a byte changes, the URL changes,
   and every cache in the path — browser and Cloudflare alike — sees a new
   resource. A build that changes nothing produces the same stamp, so a
   redeploy does not invalidate a year-long immutable cache for no reason.

   A port of AssetVersion in Support/AppConfig.swift. */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

/**
 * Twelve hex characters of a SHA-256 over every shipped file, sorted by path,
 * with the path itself mixed in so that moving a file counts as a change.
 * Returns null if the directory cannot be read, leaving the caller to fall
 * back rather than silently stamping every build identically.
 */
export function deriveAssetVersion(directory) {
    const relativePaths = shippedFiles(directory);
    if (!relativePaths || relativePaths.length === 0) return null;

    const hasher = createHash("sha256");
    for (const relativePath of relativePaths.sort()) {
        hasher.update(Buffer.from(relativePath, "utf8"));
        try {
            hasher.update(readFileSync(join(directory, relativePath)));
        } catch {
            return null;
        }
    }
    return hasher.digest("hex").slice(0, 12);
}

/**
 * Every regular file under `root`, as paths relative to it, in POSIX form so
 * the stamp does not depend on the platform that computed it.
 *
 * Dotfiles are skipped so that a stray `.DS_Store` cannot make a developer's
 * stamp differ from the one CI computes for identical assets.
 */
export function shippedFiles(root) {
    let entries;
    try {
        entries = readdirSync(root, { withFileTypes: true });
    } catch {
        return null;
    }

    const paths = [];
    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory()) {
            const nested = shippedFiles(join(root, entry.name));
            if (nested === null) return null;
            for (const path of nested) paths.push(posix.join(entry.name, path));
        } else if (entry.isFile()) {
            paths.push(entry.name);
        }
    }
    return paths;
}
