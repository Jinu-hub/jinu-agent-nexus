// ─────────────────────────────────────────────────────────────────────────
// Tool: recall — RAG retrieval
//
// PATTERN: SERVER-SIDE TOOL THAT QUERIES A VECTOR DB
// ─────────────────────────────────────────────────────────────────────────
// This is the read-side of the RAG flow. The write-side (uploadPdf,
// ingestUrl) is on ChatAgent itself — see `uploadPdf` for the full
// "PDF → markdown → chunk → embed → upsert" path.
//
// What this tool does on each call:
//   1. Embed the query string using AI Gateway → OpenAI
//   2. Query Vectorize for the top-K most similar chunks
//   3. Look up the original text of those chunks from the agent's
//      local SQLite (the two-store pattern: vectors in Vectorize,
//      raw text in `this.sql`, joined by chunk ID)
//   4. Return the chunks with their source name
//
// The two-store pattern lets us delete a source cleanly — drop SQL
// rows, drop Vectorize IDs, drop R2 object — without any of the
// stores becoming inconsistent.
// ─────────────────────────────────────────────────────────────────────────

import { tool, embed } from "ai";
import { z } from "zod";
import type { ChatAgent } from "../chat-agent";
import { createEmbedder } from "../ai";

// The factory accepts both the agent (for `sql` access) and `env`
// (for `VECTOR_DB` and the embedder). Splitting them is just a
// visibility quirk — `env` is protected on the agent class, so we
// hand it in explicitly from within the class at the call site.
export function createRecallTool(agent: ChatAgent, env: Env) {
  return tool({
    description:
      "Search ingested documents (PDFs uploaded by the user) for chunks relevant to a query. Call this BEFORE answering questions that might be in the user's saved sources. Returns up to 5 chunks with their source name. Cite the source in your answer.",
    inputSchema: z.object({
      query: z.string().describe("What to look up."),
    }),
    execute: async ({ query }) => {
      const { embedding } = await embed({
        model: createEmbedder(env),
        value: query,
      });
      const matches = await env.VECTOR_DB.query(embedding, { topK: 5 });

      // For each matching vector ID, look up the raw chunk text from
      // SQLite. flatMap because some matches might be stale (vector
      // there but row gone) — flatMap silently drops the empty arrays.
      const chunks = matches.matches.flatMap(
        (m) => agent.sql<{ source: string; text: string }>`
          SELECT source, text FROM chunks WHERE id = ${m.id}
        `,
      );
      return { chunks };
    },
  });
}
