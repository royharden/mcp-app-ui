// Host-side CSP envelope for the Lab's srcdoc frame, generated from validated resource
// metadata before any view script can run. A srcdoc + meta-CSP fixture is NOT a conformant
// separate-origin production sandbox; it is an inspection aid.
import { sha256Hex } from "../../server/domain/crypto.ts";

export interface ResourceCsp {
  connectDomains: string[];
  resourceDomains: string[];
  frameDomains: string[];
}

export interface Envelope {
  html: string;
  policy: string;
  rawSha256: string;
  envelopeSha256: string;
  scriptHash: string;
  styleHash: string | null;
}

export class EnvelopeError extends Error {}

/** Accept only the empty allowlists this app declares; anything else is refused, not widened. */
export function validateResourceMeta(meta: unknown): ResourceCsp {
  const csp = (meta as { ui?: { csp?: unknown } } | undefined)?.ui?.csp as Partial<ResourceCsp> | undefined;
  if (!csp) throw new EnvelopeError("Resource metadata has no ui.csp declaration.");
  for (const key of ["connectDomains", "resourceDomains", "frameDomains"] as const) {
    const value = csp[key] ?? [];
    if (!Array.isArray(value)) throw new EnvelopeError(`ui.csp.${key} is not a list.`);
    if (value.length > 0) throw new EnvelopeError(`ui.csp.${key} requests external origins; this Lab allows none.`);
  }
  return { connectDomains: [], resourceDomains: [], frameDomains: [] };
}

async function sha256Base64(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let binary = "";
  for (const b of new Uint8Array(digest)) binary += String.fromCharCode(b);
  return btoa(binary);
}

interface RawElement {
  tag: "script" | "style";
  attributes: string;
  content: string;
}

/**
 * Walks the markup outside raw-text elements. Script and style contents are skipped as
 * opaque text (a bundle may contain the characters "<script>" inside a string literal); an
 * element ends at the first matching close tag, as an HTML parser would end it.
 */
function scanRawTextElements(html: string): { elements: RawElement[]; outside: string } {
  const elements: RawElement[] = [];
  let outside = "";
  let pos = 0;
  const open = /<(script|style)\b([^>]*)>/gi;
  for (;;) {
    open.lastIndex = pos;
    const match = open.exec(html);
    if (!match) {
      outside += html.slice(pos);
      break;
    }
    outside += html.slice(pos, match.index);
    const tag = match[1].toLowerCase() as RawElement["tag"];
    const contentStart = match.index + match[0].length;
    // Case-insensitive search on the original string (a lowercased copy can change length).
    // The tag name must end at whitespace, "/" or ">", as in the HTML tokenizer.
    const closeTag = new RegExp(`</${tag}(?=[\s/>])`, "gi");
    closeTag.lastIndex = contentStart;
    const closeMatch = closeTag.exec(html);
    if (!closeMatch) throw new EnvelopeError(`Unterminated <${tag}> element.`);
    const close = closeMatch.index;
    const content = html.slice(contentStart, close);
    // Browsers hash script/style text after normalizing CR/CRLF and NUL; refuse instead of guessing.
    if (/[\r\0]/.test(content)) throw new EnvelopeError(`The <${tag}> text contains CR or NUL characters.`);
    elements.push({ tag, attributes: match[2], content });
    const closeEnd = html.indexOf(">", close);
    if (closeEnd < 0) throw new EnvelopeError(`Malformed </${tag}> tag.`);
    pos = closeEnd + 1;
  }
  return { elements, outside };
}

/** Exactly one attribute-less inline classic script and at most one inline style. */
export function extractInline(html: string): { script: string; style: string | null } {
  const { elements, outside } = scanRawTextElements(html);
  if (/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(outside)) throw new EnvelopeError("External stylesheets are not allowed.");
  const scripts = elements.filter((e) => e.tag === "script");
  if (scripts.length !== 1) throw new EnvelopeError(`Expected one inline script, found ${scripts.length}.`);
  if (/\bsrc\s*=/i.test(scripts[0].attributes)) throw new EnvelopeError("External scripts are not allowed.");
  if (scripts[0].attributes.trim() !== "") throw new EnvelopeError("The inline script must be a classic script without attributes.");
  const styles = elements.filter((e) => e.tag === "style");
  if (styles.length > 1) throw new EnvelopeError(`Expected at most one inline style, found ${styles.length}.`);
  return { script: scripts[0].content, style: styles.length === 1 ? styles[0].content : null };
}

export async function buildEnvelope(html: string, meta: unknown): Promise<Envelope> {
  validateResourceMeta(meta);
  const { script, style } = extractInline(html);
  const scriptHash = `'sha256-${await sha256Base64(script)}'`;
  const styleHash = style === null ? null : `'sha256-${await sha256Base64(style)}'`;
  const policy = [
    "default-src 'none'",
    `script-src ${scriptHash}`,
    `style-src ${styleHash ?? "'none'"}`,
    "img-src 'none'",
    "font-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  const meta_ = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  const headOpen = html.match(/<head\b[^>]*>/i);
  if (!headOpen || headOpen.index === undefined) throw new EnvelopeError("The resource has no <head> to carry the policy.");
  const at = headOpen.index + headOpen[0].length;
  // The policy is the first element in <head>, ahead of the style and the script.
  const enveloped = `${html.slice(0, at)}${meta_}${html.slice(at)}`;
  return {
    html: enveloped,
    policy,
    rawSha256: await sha256Hex(html),
    envelopeSha256: await sha256Hex(enveloped),
    scriptHash,
    styleHash,
  };
}
