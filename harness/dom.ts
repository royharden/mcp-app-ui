// Minimal DOM driver for the exact view running in a harness frame. Uses the frame's own
// Event constructors and native value setters so React's synthetic events fire.

export class HarnessTimeoutError extends Error {}

/** Polls with real timers. Never used for performance measurement. */
export async function waitFor<T>(check: () => T | null | undefined | false, what: string, timeoutMs = 5000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new HarnessTimeoutError(`Timed out after ${timeoutMs} ms waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export function viewDriver(getDocument: () => Document | null) {
  function doc(): Document {
    const d = getDocument();
    if (!d) throw new Error("The view document is not reachable from the harness.");
    return d;
  }

  function win(): Window & typeof globalThis {
    const w = doc().defaultView;
    if (!w) throw new Error("The view document has no window.");
    return w as Window & typeof globalThis;
  }

  function query<E extends Element = HTMLElement>(selector: string): E | null {
    return doc().querySelector<E>(selector);
  }

  function required<E extends Element = HTMLElement>(selector: string): E {
    const el = query<E>(selector);
    if (!el) throw new Error(`No element matches ${selector}.`);
    return el;
  }

  function click(selector: string): void {
    const el = required<HTMLButtonElement>(selector);
    if (el.disabled) throw new Error(`${selector} is disabled.`);
    el.click();
  }

  function setInput(selector: string, value: string): void {
    const el = required<HTMLInputElement>(selector);
    const setter = Object.getOwnPropertyDescriptor(win().HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new (win().Event)("input", { bubbles: true }));
  }

  function setSelect(label: string, value: string): void {
    const labels = Array.from(doc().querySelectorAll("form.filters label"));
    const match = labels.find((l) => l.textContent?.trim().startsWith(label));
    const select = match?.querySelector("select");
    if (!select) throw new Error(`No filter select labelled ${label}.`);
    const setter = Object.getOwnPropertyDescriptor(win().HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, value);
    select.dispatchEvent(new (win().Event)("change", { bubbles: true }));
  }

  function chooseDecision(decision: "approve" | "reject"): void {
    required<HTMLInputElement>(`input[name="decision"][value="${decision}"]`).click();
  }

  function text(selector: string): string | null {
    return query(selector)?.textContent ?? null;
  }

  function phase(): string | null {
    return query("[data-phase]")?.getAttribute("data-phase") ?? null;
  }

  function rowIds(): string[] {
    return Array.from(doc().querySelectorAll<HTMLButtonElement>('button[data-action="select"]')).map(
      (b) => b.getAttribute("data-id") ?? "",
    );
  }

  return { doc, query, required, click, setInput, setSelect, chooseDecision, text, phase, rowIds };
}

export type ViewDriver = ReturnType<typeof viewDriver>;
