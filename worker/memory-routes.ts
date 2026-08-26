// ─────────────────────────────────────────────────────────────────────────
// My Market Memory HTTP API — routes → MyMemory Durable Object (SQLite)
// ─────────────────────────────────────────────────────────────────────────
//
//   GET    /memory                 — preferences + weights + recent events
//   GET    /memory/preferences     — current interests
//   POST   /memory/preferences     — upsert { kind, target, level }
//   DELETE /memory/preferences     — body { kind, target }
//   GET    /memory/events          — recent history (?limit=100)
//   POST   /memory/events          — { action, kind?, target, meta? }
//   GET    /memory/weights         — Brief personalization scores
//
// Visitor IP / city / country stored on each mutating event (challenge-style).
// ─────────────────────────────────────────────────────────────────────────

import {
  MyMemory,
  visitorGeoFromRequest,
  type PreferenceAction,
  type PreferenceKind,
} from "./my-memory";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function errorResponse(err: unknown, fallback = 400): Response {
  const message = err instanceof Error ? err.message : String(err);
  const status =
    message.includes("invalid") || message.includes("required")
      ? 400
      : fallback;
  return json({ error: message }, status);
}

function memoryStub(env: Env): DurableObjectStub<MyMemory> {
  const id = env.MyMemory.idFromName("default");
  return env.MyMemory.get(id);
}

export async function handleMemoryRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname !== "/memory" && !pathname.startsWith("/memory/")) {
    return null;
  }

  const stub = memoryStub(env);
  const geo = visitorGeoFromRequest(request);

  try {
    if (pathname === "/memory" && request.method === "GET") {
      return json(await stub.getProfile());
    }

    if (pathname === "/memory/preferences") {
      if (request.method === "GET") {
        return json(await stub.listPreferences());
      }
      if (request.method === "POST") {
        const body = (await request.json()) as {
          kind?: PreferenceKind;
          target?: string;
          level?: number;
        };
        if (!body.kind || body.target == null || body.level == null) {
          return json(
            { error: "kind, target, and level are required" },
            400,
          );
        }
        const row = await stub.upsertPreference({
          kind: body.kind,
          target: body.target,
          level: body.level,
          geo,
        });
        return json(row, 201);
      }
      if (request.method === "DELETE") {
        const body = (await request.json()) as {
          kind?: PreferenceKind;
          target?: string;
        };
        if (!body.kind || body.target == null) {
          return json({ error: "kind and target are required" }, 400);
        }
        return json(await stub.deletePreference(body.kind, body.target));
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (pathname === "/memory/events") {
      if (request.method === "GET") {
        const limit = Number(url.searchParams.get("limit") ?? "100");
        return json(await stub.listEvents(Number.isFinite(limit) ? limit : 100));
      }
      if (request.method === "POST") {
        const body = (await request.json()) as {
          action?: PreferenceAction;
          kind?: PreferenceKind | null;
          target?: string;
          meta?: unknown;
        };
        if (!body.action || body.target == null) {
          return json({ error: "action and target are required" }, 400);
        }
        const row = await stub.recordEvent({
          action: body.action,
          kind: body.kind ?? null,
          target: body.target,
          meta: body.meta,
          geo,
        });
        return json(row, 201);
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (pathname === "/memory/weights" && request.method === "GET") {
      return json(await stub.listWeights());
    }

    return json({ error: "not found" }, 404);
  } catch (err) {
    return errorResponse(err);
  }
}
