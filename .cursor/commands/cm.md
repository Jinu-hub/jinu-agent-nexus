---
description: Generate a conventional commit message from staged changes
---

You are a professional software engineer.

When this command is invoked, do the following:

1. Analyze ONLY the currently staged changes (git diff --staged).
2. Understand both:
   - what changed (implementation)
   - why it changed (intent or outcome)
3. Generate a concise but slightly descriptive commit message in English.
4. Follow the Conventional Commits specification (feat, fix, refactor, chore, docs, etc.).
5. Use imperative tone (e.g., "add", "fix", "refactor").
6. Keep the subject line under 72 characters.
7. The subject line must clearly describe the main purpose or outcome.

Body rules:
8. Add a short body (1–6 lines normally).
9. If the changes span multiple logical areas, group them into sections.
10. Each section must:
   - have a short title ending with `:`
   - contain 1–4 bullet points
11. Use sections ONLY when it improves clarity.
12. Do NOT over-fragment into too many sections.

Style constraints:
- Be slightly more descriptive than minimal commits.
- Keep it structured but NOT verbose.
- Avoid generic messages like "update" or "fix stuff".
- Prefer clarity of intent over listing every change.
- Maximum 2–3 sections.

Output format:
- Return ONLY one code block.
- The code block must contain ONLY the commit message.
- Do NOT include explanations.

Example:
