/* The JSON-LD block is the one place on the page emitted raw, so the escaping
   that makes that safe is tested directly rather than inferred.

   A port of the StructuredData tests. */

import assert from "node:assert/strict";
import { test } from "node:test";

import { homePerson, sortedStringify } from "../lib/structured-data.mjs";

test("A value containing markup cannot terminate the script element", () => {
    const payload = homePerson({
        name: "</script><img src=x onerror=alert(1)>",
        jobTitle: "Ampersand & Angle < Bracket >",
        url: "https://example.com/?a=1&b=2",
        sameAs: ["https://example.com/a&b"],
    });

    // Nothing that could close the element survives serialization.
    assert.ok(!payload.includes("<"));
    assert.ok(!payload.includes(">"));
    assert.ok(!payload.includes("&"));

    // ...and it is still the same data once parsed.
    const json = JSON.parse(payload);
    assert.equal(json.name, "</script><img src=x onerror=alert(1)>");
    assert.equal(json.jobTitle, "Ampersand & Angle < Bracket >");
    assert.equal(json.url, "https://example.com/?a=1&b=2");
});

test("Serialization is a function of the values alone", () => {
    // Sorted at every level, so two builds of identical content produce an
    // identical page and no cache is invalidated by key ordering.
    assert.equal(
        sortedStringify({ b: 1, a: { d: 2, c: [{ f: 3, e: 4 }] } }),
        '{"a":{"c":[{"e":4,"f":3}],"d":2},"b":1}',
    );
});
