// Declared DOM shims for happy-dom runs. They make dependencies load; they prove nothing about
// layout, focus, media queries, CSP or isolation. Installed only when a DOM is present.
export const INSTALLED_SHIMS: string[] = [];

type ShimWindow = Window & typeof globalThis;

export function installDomShims(w: ShimWindow): string[] {
  const installed: string[] = [];
  if (typeof w.matchMedia !== "function") {
    // Always reports "no match" (light theme, motion allowed).
    w.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof w.matchMedia;
    installed.push("matchMedia: never matches");
  }
  if (typeof w.ResizeObserver !== "function") {
    // Never fires; the SDK's autoResize therefore sends no size notifications in the harness.
    w.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    installed.push("ResizeObserver: never fires");
  }
  if (typeof w.IntersectionObserver !== "function") {
    w.IntersectionObserver = class {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
    installed.push("IntersectionObserver: never fires");
  }
  if (typeof w.HTMLElement !== "undefined" && typeof w.HTMLElement.prototype.scrollIntoView !== "function") {
    w.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
    installed.push("scrollIntoView: no-op");
  }
  return installed;
}

if (typeof window !== "undefined") {
  INSTALLED_SHIMS.push(...installDomShims(window as ShimWindow));
}
