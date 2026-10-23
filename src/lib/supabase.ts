import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface PublicConfig {
  url: string;
  anonKey: string;
}

const MISSING =
  "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. The local preview stays read-only, and commits stay disabled.";

export function readPublicConfig(): { ok: true; config: PublicConfig } | { ok: false; message: string } {
  const url = (import.meta.env.VITE_SUPABASE_URL?.trim() ?? "").replace(/\/+$/, "");
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anonKey) {
    return { ok: false, message: MISSING };
  }
  if (!isOrigin(url)) {
    return { ok: false, message: "VITE_SUPABASE_URL must be an http or https origin, with no path." };
  }
  return { ok: true, config: { url, anonKey } };
}

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
}

export function createBrowserClient(config: PublicConfig): SupabaseClient {
  return createClient(config.url, config.anonKey);
}
