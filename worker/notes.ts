// ─────────────────────────────────────────────────────────────────────────
// My Market Notes — Workers KV prototype (Personalization seed)
// ─────────────────────────────────────────────────────────────────────────
//
// Challenge routes (edge key-value note API):
//   POST /notes/:key  — store request body under :key
//   GET  /notes/:key  — return stored note
//   GET  /notes       — return list of keys
//
// Product framing (loose, evolvable):
//   interest:bitcoin          → interest note
//   hide:biotech              → suppress topic
//   memo:samsung-foundry      → short personal memo
//   state:last-topic          → light UI state
//
// Keep this thin. Structured profiles / behavior history belong in
// D1 or DO SQLite later — not here.
// ─────────────────────────────────────────────────────────────────────────

type NotesEnv = { NOTES: KVNamespace };

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

/** Decode and validate the `:key` path segment. */
function parseKey(raw: string): string | null {
  if (!raw) return null;
  let key: string;
  try {
    key = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!key || key === "." || key === "..") return null;
  // KV key limit is 512 bytes
  if (new TextEncoder().encode(key).length > 512) return null;
  return key;
}

async function listAllKeys(ns: KVNamespace): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await ns.list({ cursor, limit: 1000 });
    for (const entry of page.keys) keys.push(entry.name);
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  return keys;
}

/**
 * Handle `/notes` and `/notes/:key`. Returns `null` if the path is
 * not a notes route (caller should continue to other handlers).
 */
export async function handleNotesRequest(
  request: Request,
  env: NotesEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname !== "/notes" && !pathname.startsWith("/notes/")) {
    return null;
  }

  // GET /notes — key list
  if (pathname === "/notes") {
    if (request.method !== "GET") {
      return json({ error: "method not allowed" }, 405);
    }
    const keys = await listAllKeys(env.NOTES);
    return json(keys);
  }

  // /notes/:key
  const rawKey = pathname.slice("/notes/".length);
  // Disallow nested paths like /notes/a/b for the challenge contract
  if (rawKey.includes("/")) {
    return badRequest("key must be a single path segment");
  }
  const key = parseKey(rawKey);
  if (!key) return badRequest("invalid key");

  if (request.method === "POST") {
    const body = await request.text();
    await env.NOTES.put(key, body);
    return json({ ok: true, key }, 201);
  }

  if (request.method === "GET") {
    const value = await env.NOTES.get(key);
    if (value === null) {
      return json({ error: "not found", key }, 404);
    }
    return new Response(value, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return json({ error: "method not allowed" }, 405);
}
