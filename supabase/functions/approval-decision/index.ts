import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const LOCAL_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (request.headers.get("Origin") && !origin) {
    return json(403, {
      ok: false,
      error: "invalid_input",
      message: "This origin is not allowed. Add it to the CORS_ALLOW_ORIGINS server secret.",
    }, null);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "invalid_input", message: "Use POST." }, origin);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !anonKey || !serviceKey) {
    return json(500, {
      ok: false,
      error: "missing_config",
      message: "Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in server secrets.",
    }, origin);
  }

  const header = request.headers.get("Authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!jwt) {
    return json(401, {
      ok: false,
      error: "unauthenticated",
      message: "Sign in is required. A project API key is not a user.",
    }, origin);
  }

  const userClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userResult = await userClient.auth.getUser(jwt);
  if (userResult.error || !userResult.data.user) {
    return json(401, {
      ok: false,
      error: "unauthenticated",
      message: "The session is not a signed-in user. A project API key is not a user.",
    }, origin);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(400, { ok: false, error: "invalid_input", message: "JSON object required." }, origin);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "invalid_input", message: "Request body must be JSON." }, origin);
  }

  const step = body.step;
  const approvalId = typeof body.approvalId === "string" ? body.approvalId : "";
  const action = typeof body.action === "string" ? body.action : "";
  if ((step !== "request" && step !== "commit") || !UUID_PATTERN.test(approvalId) || (action !== "approve" && action !== "deny")) {
    return json(400, {
      ok: false,
      error: "invalid_input",
      message: "step, approvalId, and action are required. approvalId must be a UUID.",
    }, origin);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc = step === "request"
    ? await admin.rpc("request_approval_decision", {
      p_actor: userResult.data.user.id,
      p_approval_id: approvalId,
      p_action: action,
    })
    : await commitCall(admin, userResult.data.user.id, approvalId, action, body);

  if (rpc.error || rpc.data === null || rpc.data === undefined) {
    return json(400, {
      ok: false,
      error: "invalid_input",
      message: "The database rejected the decision call. Apply the Confirm Queue migration and try again.",
    }, origin);
  }
  if (!isPayload(rpc.data)) {
    return json(500, {
      ok: false,
      error: "invalid_input",
      message: "The database returned an unexpected decision payload.",
    }, origin);
  }
  return json(rpc.data.ok ? 200 : statusFor(rpc.data.error), rpc.data, origin);
});

function commitCall(
  admin: ReturnType<typeof createClient>,
  actorId: string,
  approvalId: string,
  action: string,
  body: Record<string, unknown>,
) {
  const token = typeof body.token === "string" ? body.token : "";
  const statement = typeof body.statement === "string" ? body.statement : "";
  const note = typeof body.note === "string" ? body.note : "";
  if (!token || !statement) {
    return Promise.resolve({
      data: {
        ok: false,
        error: "invalid_input",
        message: "token and statement are required.",
      },
      error: null,
    });
  }
  return admin.rpc("commit_approval_decision", {
    p_actor: actorId,
    p_approval_id: approvalId,
    p_action: action,
    p_token: token,
    p_statement: statement,
    p_note: note,
  });
}

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return null;
  }
  const extra = (Deno.env.get("CORS_ALLOW_ORIGINS") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return [...LOCAL_ORIGINS, ...extra].includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!origin) {
    return headers;
  }
  headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type";
  headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  headers.Vary = "Origin";
  return headers;
}

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

function statusFor(code: string): number {
  if (code === "unauthenticated") {
    return 401;
  }
  if (code === "not_owner") {
    return 403;
  }
  if (code === "unknown_approval") {
    return 404;
  }
  if (code === "missing_config") {
    return 500;
  }
  return 400;
}

function isPayload(value: unknown): value is { ok: true } | { ok: false; error: string; message: string } {
  if (!value || typeof value !== "object" || !("ok" in value)) {
    return false;
  }
  if (value.ok === true) {
    return true;
  }
  return value.ok === false && "error" in value && typeof value.error === "string" && "message" in value && typeof value.message === "string";
}
