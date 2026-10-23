# UI versus text

There is no published MCP Apps benchmark for this comparison. This repo does not invent one. `buildScriptedReport` walks three fixed tasks through the in-memory store.

| Task | Fair? | What it shows |
|---|---|---|
| `name-high-risk` | Yes | Both sides can name "Grant production database read" from one list. The UI character count is the card labels. The text count is the full fallback. |
| `approve-low-risk` | No | The view commits the rename. The model audience is blocked on `commit_decision`. |
| `deny-with-note` | No | The view denies the export and keeps the note. The model audience is blocked on `request_decision`. |

Write-task failure on the text path is the authorization rule, not a quality score. Token counts are `Math.ceil(characters / 4)`. There is no wall-clock measurement and no statistical claim. Do not quote the table as evidence about a live model.

A later study would need a fixed task card, a real host, and a separate note that these scripted numbers are not that study.
