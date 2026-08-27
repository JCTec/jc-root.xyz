/* The cache-busting stamp is derived from the bytes it names, so it cannot
   disagree with them. A port of the AssetVersion tests. */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { deriveAssetVersion } from "../lib/asset-version.mjs";

test("The asset stamp is derived from the directory, and changes when it does", () => {
    const dir = mkdtempSync(join(tmpdir(), "assetversion-"));
    try {
        const asset = join(dir, "site.css");
        writeFileSync(asset, "a{}");

        const first = deriveAssetVersion(dir);
        assert.ok(first);
        assert.equal(first.length, 12);
        assert.match(first, /^[0-9a-f]{12}$/);

        // Same bytes, same stamp: a rebuild that changes nothing must not
        // invalidate a year-long immutable cache.
        assert.equal(deriveAssetVersion(dir), first);

        writeFileSync(asset, "a{color:red}");
        assert.notEqual(deriveAssetVersion(dir), first);

        // A rename is a change: the path is mixed into the digest.
        const renamed = join(dir, "other.css");
        renameSync(asset, renamed);
        assert.notEqual(deriveAssetVersion(dir), first);

        // Dotfiles are ignored so a stray .DS_Store cannot make a developer's
        // stamp differ from the one CI computes for identical assets.
        const afterRename = deriveAssetVersion(dir);
        writeFileSync(join(dir, ".DS_Store"), "junk");
        assert.equal(deriveAssetVersion(dir), afterRename);

        // Nested files count, and are addressed by their relative path.
        mkdirSync(join(dir, "nested"));
        writeFileSync(join(dir, "nested", "a.js"), "x");
        assert.notEqual(deriveAssetVersion(dir), afterRename);

        assert.equal(deriveAssetVersion(join(dir, "does-not-exist")), null);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
