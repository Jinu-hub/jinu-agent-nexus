import { embedMany } from "ai";

import { chunkMarkdown } from "../ingest";
import { createEmbedder } from "../ai";
import { refreshPanelState } from "./refresh-state";
import type { RagAgentHost } from "./agent-host";

// Called from worker/index.ts when the user uploads a PDF via the
// Sources panel.
export async function uploadPdf(
  agent: RagAgentHost,
  env: Env,
  buffer: ArrayBuffer,
  name: string,
) {
  const r2Key = `pdfs/${crypto.randomUUID()}-${name}`;
  await env.BUCKET.put(r2Key, buffer, {
    httpMetadata: { contentType: "application/pdf" },
  });

  const blob = new Blob([buffer], { type: "application/pdf" });
  const [result] = await env.AI.toMarkdown([{ name, blob }]);
  if (result.format === "error") {
    throw new Error(`toMarkdown failed for ${name}: ${result.error}`);
  }
  return await ingestMarkdown(agent, env, name, "pdf", result.data, r2Key);
}

async function ingestMarkdown(
  agent: RagAgentHost,
  env: Env,
  source: string,
  kind: "pdf",
  markdown: string,
  r2Key: string | null,
) {
  void agent.sql`
    INSERT OR REPLACE INTO documents (source, kind, r2_key)
    VALUES (${source}, ${kind}, ${r2Key})
  `;

  const texts = chunkMarkdown(markdown);
  const { embeddings } = await embedMany({
    model: createEmbedder(env),
    values: texts,
  });
  const vectors = texts.map((text, i) => {
    const id = crypto.randomUUID();
    void agent.sql`
      INSERT INTO chunks (id, source, text)
      VALUES (${id}, ${source}, ${text})
    `;
    return { id, values: embeddings[i], metadata: { source } };
  });
  await env.VECTOR_DB.upsert(vectors);
  agent.broadcast(JSON.stringify({ type: "source_added", source }));
  await refreshPanelState(agent);
  return { source, chunks: texts.length };
}

export async function deleteSource(
  agent: RagAgentHost,
  env: Env,
  source: string,
) {
  const ids = agent.sql<{ id: string }>`
    SELECT id FROM chunks WHERE source = ${source}
  `.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    await env.VECTOR_DB.deleteByIds(ids.slice(i, i + 100));
  }

  const [doc] = agent.sql<{ r2_key: string | null }>`
    SELECT r2_key FROM documents WHERE source = ${source}
  `;
  if (doc?.r2_key) await env.BUCKET.delete(doc.r2_key);

  void agent.sql`DELETE FROM chunks WHERE source = ${source}`;
  void agent.sql`DELETE FROM documents WHERE source = ${source}`;

  agent.broadcast(JSON.stringify({ type: "source_removed", source }));
  await refreshPanelState(agent);
  return { source, deletedChunks: ids.length };
}

export async function deleteAllSources(agent: RagAgentHost, env: Env) {
  const ids = agent.sql<{ id: string }>`SELECT id FROM chunks`.map(
    (r) => r.id,
  );
  for (let i = 0; i < ids.length; i += 100) {
    await env.VECTOR_DB.deleteByIds(ids.slice(i, i + 100));
  }
  const keys = agent.sql<{ r2_key: string }>`
    SELECT r2_key FROM documents WHERE r2_key IS NOT NULL
  `.map((r) => r.r2_key);
  if (keys.length > 0) await env.BUCKET.delete(keys);

  void agent.sql`DELETE FROM chunks`;
  void agent.sql`DELETE FROM documents`;

  agent.broadcast(JSON.stringify({ type: "all_cleared" }));
  await refreshPanelState(agent);
  return { deletedChunks: ids.length, deletedFiles: keys.length };
}
