import { RESOURCE_CSP } from "../domain/securityPolicy.ts";

const HOST_ORIGIN_MARKER = '<meta name="mcp-host-origin" content="" />';

export function buildAppHtml(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<meta http-equiv="Content-Security-Policy" content="${RESOURCE_CSP}" />`,
    HOST_ORIGIN_MARKER,
    "<title>Confirm Queue</title>",
    "<style>",
    "body { margin: 0; font: 16px/1.4 Georgia, serif; background: #f4f1ea; color: #1c1915; }",
    "main { padding: 16px; }",
    "button { margin-right: 8px; }",
    "pre { white-space: pre-wrap; background: #fff; padding: 8px; }",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>Confirm Queue</h1>",
    '<p id="status"></p>',
    '<ul id="list"></ul>',
    '<pre id="statement"></pre>',
    '<label>Note <input id="note" type="text" maxlength="500" /></label>',
    '<button id="confirm" type="button">Confirm this exact change</button>',
    "</main>",
    "<script>",
    scriptBody(),
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");
}

export function withHostOrigin(html: string, hostOrigin: string): string {
  const origin = parseOrigin(hostOrigin);
  if (!origin) {
    throw new Error("Host origin must be an http or https origin with no path.");
  }
  if (!html.includes(HOST_ORIGIN_MARKER)) {
    throw new Error("App document is missing the host-origin marker.");
  }
  return html.replace(HOST_ORIGIN_MARKER, `<meta name="mcp-host-origin" content="${origin}" />`);
}

function parseOrigin(value: string): string | null {
  if (value.includes('"') || value.includes("<") || value.includes(">")) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.origin !== value) {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function scriptBody(): string {
  return [
    "(function () {",
    '  var meta = document.querySelector(\'meta[name="mcp-host-origin"]\');',
    '  var hostOrigin = meta ? meta.getAttribute("content") || "" : "";',
    '  var status = document.getElementById("status");',
    '  var list = document.getElementById("list");',
    '  var statement = document.getElementById("statement");',
    "  if (!hostOrigin) {",
    '    status.textContent = "This view stays idle until the sandbox proxy sets mcp-host-origin.";',
    "    return;",
    "  }",
    "  var nextId = 1;",
    "  var pending = null;",
    "  function send(method, params) {",
    "    var id = nextId;",
    "    nextId += 1;",
    "    parent.postMessage({ jsonrpc: \"2.0\", id: id, method: method, params: params }, hostOrigin);",
    "    return id;",
    "  }",
    "  function renderItems(items) {",
    "    while (list.firstChild) { list.removeChild(list.firstChild); }",
    "    items.forEach(function (item) {",
    '      var row = document.createElement("li");',
    '      row.textContent = item.title + " (" + item.risk + ", " + item.status + ")";',
    "      row.appendChild(actionButton(item.id, \"approve\", \"Approve\"));",
    "      row.appendChild(actionButton(item.id, \"deny\", \"Deny\"));",
    "      list.appendChild(row);",
    "    });",
    "  }",
    "  function actionButton(id, action, label) {",
    '    var button = document.createElement("button");',
    '    button.type = "button";',
    "    button.textContent = label;",
    "    button.addEventListener(\"click\", function () {",
    '      send("tools/call", { name: "request_decision", arguments: { id: id, action: action } });',
    "    });",
    "    return button;",
    "  }",
    '  document.getElementById("confirm").addEventListener("click", function () {',
    "    if (!pending) {",
    '      status.textContent = "Request a decision before confirming.";',
    "      return;",
    "    }",
    '    var noteInput = document.getElementById("note");',
    '    var note = noteInput && noteInput.value ? noteInput.value : "";',
    '    send("tools/call", {',
    '      name: "commit_decision",',
    "      arguments: {",
    "        id: pending.approvalId,",
    "        action: pending.action,",
    "        token: pending.token,",
    "        statement: pending.statement,",
    "        note: note",
    "      }",
    "    });",
    "  });",
    '  window.addEventListener("message", function (event) {',
    "    if (event.origin !== hostOrigin) { return; }",
    "    var msg = event.data;",
    '    if (!msg || msg.jsonrpc !== "2.0") { return; }',
    '    if (msg.method === "ui/notifications/tool-result") {',
    "      var items = msg.params && msg.params.items ? msg.params.items : [];",
    "      renderItems(items);",
    "      return;",
    "    }",
    "    var structured = msg.result && msg.result.structuredContent;",
    "    if (structured && structured.challenge && structured.challenge.statement) {",
    "      pending = structured.challenge;",
    "      statement.textContent = structured.challenge.statement;",
    "      return;",
    "    }",
    "    var text = msg.result && msg.result.content && msg.result.content[0] && msg.result.content[0].text;",
    "    if (text) { status.textContent = text; }",
    "  });",
    '  send("ui/initialize", { appInfo: { name: "Confirm Queue", version: "0.1.0" } });',
    '  parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized" }, hostOrigin);',
    "})();",
  ].join("\n");
}
