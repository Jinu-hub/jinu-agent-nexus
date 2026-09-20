// ─────────────────────────────────────────────────────────────────────────
// My Market Memory HTTP API — routes → MyMemory Durable Object (SQLite)
// ─────────────────────────────────────────────────────────────────────────
//
//   GET    /memory                 — preferences + weights + recent events
//   GET    /memory/preferences     — current interests (?category=market)
//   POST   /memory/preferences     — upsert { category?, kind, target, level, display? }
//   DELETE /memory/preferences     — body { category?, kind, target }
//   GET    /memory/events          — recent history (?limit=100)
//   POST   /memory/events          — { action, category?, kind?, target, meta? }
//   GET    /memory/weights         — Brief personalization scores (?category=)
//
//   GET    /memory/topic-labels    — key → display (?lang=ko|en; ?keys=a,b)
//                                    **always shared MyMemory "default"** (not guest)
//   POST   /memory/topic-labels    — upsert into shared "default"
//
// Visitor IP / city / country stored on each mutating event (challenge-style).
// ─────────────────────────────────────────────────────────────────────────

import {
  visitorGeoFromRequest,
  type PreferenceAction,
  type PreferenceKind,
} from "./my-memory";
import { DEFAULT_INSTANCE_NAME } from "../src/lib/agent-identity";
import { resolveTrustedInstanceName } from "./auth";
import { myMemoryStub } from "./lib/my-memory-stub";

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

export async function handleMemoryRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname !== "/memory" && !pathname.startsWith("/memory/")) {
    return null;
  }

  /** Shared UI label cache — never guest/user (see docs/INSTANCE_DATA.md). */
  const labelsStub = myMemoryStub(env, DEFAULT_INSTANCE_NAME);

  // topic_labels do not need a personal instance / JWT.
  if (pathname === "/memory/topic-labels") {
    try {
      if (request.method === "GET") {
        const lang = url.searchParams.get("lang");
        const keysParam = url.searchParams.get("keys");
        if (keysParam) {
          const keys = keysParam
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean);
          return json(await labelsStub.getTopicLabelsByKeys(keys, lang));
        }
        return json(await labelsStub.listTopicLabels(lang));
      }
      if (request.method === "POST") {
        const body = (await request.json()) as {
          key?: string;
          display?: string;
          lang?: string;
          labels?: Array<{ key?: string; display?: string; lang?: string }>;
        };
        if (Array.isArray(body.labels)) {
          const entries = body.labels
            .filter(
              (e): e is { key: string; display: string; lang?: string } =>
                typeof e?.key === "string" &&
                typeof e?.display === "string" &&
                Boolean(e.key.trim() && e.display.trim()),
            )
            .map((e) => ({
              key: e.key,
              display: e.display,
              lang: e.lang ?? body.lang,
            }));
          return json(
            await labelsStub.upsertTopicLabels(entries, body.lang),
            201,
          );
        }
        if (!body.key || body.display == null) {
          return json({ error: "key and display are required" }, 400);
        }
        return json(
          await labelsStub.upsertTopicLabel(body.key, body.display, body.lang),
          201,
        );
      }
      return json({ error: "method not allowed" }, 405);
    } catch (err) {
      return errorResponse(err);
    }
  }

  const trusted = await resolveTrustedInstanceName(request, env);
  if (!trusted.ok) {
    return json({ error: trusted.error }, trusted.status);
  }
  const stub = myMemoryStub(env, trusted.name);
  const geo = visitorGeoFromRequest(request);

  try {
    if (pathname === "/memory" && request.method === "GET") {
      return json(await stub.getProfile());
    }

    if (pathname === "/memory/preferences") {
      if (request.method === "GET") {
        const category = url.searchParams.get("category");
        return json(await stub.listPreferences(category));
      }
      if (request.method === "POST") {
        const body = (await request.json()) as {
          category?: string | null;
          kind?: PreferenceKind;
          target?: string;
          level?: number;
          display?: string | null;
        };
        if (!body.kind || body.target == null || body.level == null) {
          return json(
            { error: "kind, target, and level are required" },
            400,
          );
        }
        const row = await stub.upsertPreference({
          category: body.category,
          kind: body.kind,
          target: body.target,
          level: body.level,
          display: body.display,
          geo,
        });
        return json(row, 201);
      }
      if (request.method === "DELETE") {
        const body = (await request.json()) as {
          category?: string | null;
          kind?: PreferenceKind;
          target?: string;
        };
        if (!body.kind || body.target == null) {
          return json({ error: "kind and target are required" }, 400);
        }
        return json(
          await stub.deletePreference(body.kind, body.target, body.category),
        );
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
          category?: string | null;
          kind?: PreferenceKind | null;
          target?: string;
          meta?: unknown;
        };
        if (!body.action || body.target == null) {
          return json({ error: "action and target are required" }, 400);
        }
        const row = await stub.recordEvent({
          action: body.action,
          category: body.category,
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
      const category = url.searchParams.get("category");
      return json(await stub.listWeights(category));
    }

    return json({ error: "not found" }, 404);
  } catch (err) {
    return errorResponse(err);
  }
}
