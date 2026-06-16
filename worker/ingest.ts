// ─────────────────────────────────────────────────────────────────────────
// Markdown chunker
//
// The AI SDK's `embedMany()` takes an array of strings — one embedding
// per string. For RAG we want each "string" to be a meaningful chunk of
// the source document: not so small that context is lost, not so big
// that the embedding signal is diluted.
//
// Strategy: split on paragraph boundaries (\n\n), then re-accumulate
// paragraphs into ~target-char chunks. Beats fixed-window slicing
// because it never cuts mid-sentence.
//
// If you switch to a non-markdown source (e.g. code, HTML stripped to
// text), consider a different splitter — e.g. semantic chunking with
// embeddings of candidate boundaries.
// ─────────────────────────────────────────────────────────────────────────

export function chunkMarkdown(md: string, target = 800): string[] {
  const parts = md.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const p of parts) {
    if (current.length + p.length > target && current.length > 0) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
