import test from "node:test";
import assert from "node:assert/strict";

import { appendCapture, clearCaptureSections } from "../lib/app.mjs";

test("clears every source-specific capture section after an order", () => {
  const content = [
    "# Weekly Add Ons",
    "",
    "Need this week:",
    "- Keep this manual note",
    "",
    "Siri captures:",
    "- Butter",
    "- Jalapeños",
    "",
    "Voice captures:",
    "- Rice",
    "",
    "Specific requests:",
    "- Keep this request",
    ""
  ].join("\n");

  assert.equal(clearCaptureSections(content), [
    "# Weekly Add Ons",
    "",
    "Need this week:",
    "- Keep this manual note",
    "",
    "Specific requests:",
    "- Keep this request",
    ""
  ].join("\n"));
});

test("a new capture recreates its source section after cleanup", () => {
  const cleaned = "# Weekly Add Ons\n\nNeed this week:\n-\n";
  assert.equal(
    appendCapture(cleaned, "Milk", "Siri"),
    "# Weekly Add Ons\n\nNeed this week:\n-\n\nSiri captures:\n- Milk\n"
  );
});

test("the first capture reuses an empty source heading", () => {
  const emptySection = "# Weekly Add Ons\n\nSiri captures:\n";
  assert.equal(
    appendCapture(emptySection, "Lemon juice", "Siri"),
    "# Weekly Add Ons\n\nSiri captures:\n- Lemon juice\n"
  );
});
