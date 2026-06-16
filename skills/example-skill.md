# Example skill

This file demonstrates the **Skills** system. Drop any markdown file into
the `skills/` directory, run `npm run seed:skills:local` (or
`...:remote` for production), and the agent will see it listed and be
able to load it on demand.

When the user asks a question that this skill could answer, the model
calls `load_context` to pull the file into its prompt. When the topic
shifts, it calls `unload_context` to free token budget.

## What skills are good for

- **Reference documents** — guidelines, style guides, internal docs
- **Domain knowledge** — recipes, glossaries, FAQ answers
- **Templates** — boilerplate text the agent should reuse verbatim
- **Personas** — when you want the agent to adopt a specific voice or
  expertise on demand

## Tips for writing skills

- Lead with a short title and one-sentence summary — the model uses
  these in the directory listing to decide whether the doc is
  relevant.
- Keep skills focused. One skill per topic. Cross-references between
  skills are fine.
- Use markdown headings and lists — they parse cleanly into context.

---

If you delete this file, the agent's "no skills indexed" placeholder
returns.
