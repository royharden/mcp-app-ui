import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uiMeta, UI_RESOURCE_URI } from "../src/domain/constants.ts";
import { ErrorCodes } from "../src/domain/errors.ts";
import { failure } from "../src/domain/confirm.ts";
import { HIGH_RISK_TITLE, seedItems } from "../src/domain/seed.ts";
import { asToolResult, failureText, listText } from "../src/domain/textFallback.ts";

describe("text fallback", () => {
  it("includes every seeded title and refuses an empty tool string", () => {
    const text = listText(seedItems());
    for (const item of seedItems()) {
      assert.equal(text.includes(item.title), true);
    }
    assert.equal(text.includes(HIGH_RISK_TITLE), true);
    assert.equal(listText([]), "No approvals are waiting.");
    assert.throws(() => asToolResult("  ", { items: [] }, false), /Tool text fallback is empty/);
  });

  it("keeps an error code in the text and uses the nested UI meta key", () => {
    const error = failure(ErrorCodes.missingActor, "Sign in is required before this queue can be read or changed.");
    const result = asToolResult(failureText(error), { error: error.code }, true);
    assert.equal(result.content[0]?.type, "text");
    assert.equal(result.content[0]?.text.includes(ErrorCodes.missingActor), true);
    assert.equal(result.isError, true);
    const meta = uiMeta();
    assert.equal(meta.ui.resourceUri, UI_RESOURCE_URI);
    assert.equal(Object.hasOwn(meta, "ui/resourceUri"), false);
  });
});
