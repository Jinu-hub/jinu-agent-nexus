#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// One-shot setup script
// ─────────────────────────────────────────────────────────────────────────
//
// Runs every wrangler call needed to bring this boilerplate to "ready
// to develop" state. Idempotent — if a resource already exists, we
// skip it and move on instead of bailing out.
//
// What this does:
//   1. Sanity-check `.dev.vars` and `wrangler.jsonc` for placeholder
//      values you still need to fill in.
//   2. Create the R2 bucket.
//   3. Create the Vectorize index (1536-dim, cosine — matches the
//      `text-embedding-3-small` embedding model).
//   4. Seed `skills/*.md` into the R2 bucket under `skills/`.
//
// Resource names are pinned at the top of this file. If you renamed
// the bucket / index in wrangler.jsonc, update them here too.
// ─────────────────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BUCKET = "boilerplate-bucket";
const VECTORIZE = "boilerplate-vectorstore";
// 768 matches `@cf/baai/bge-base-en-v1.5` (the default embedding
// model in wrangler.jsonc). If you switch EMBEDDING_MODEL to one
// with different dimensions, update this value AND drop/recreate
// the Vectorize index — its dimensions are immutable.
const VECTOR_DIM = 768;
const SKILLS_DIR = "skills";

// ─── ANSI colors ─────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

const log = {
  header: (t) => console.log(`\n${c.bold}${c.cyan}▸ ${t}${c.reset}`),
  ok: (t) => console.log(`  ${c.green}✓${c.reset} ${t}`),
  skip: (t) => console.log(`  ${c.yellow}↻${c.reset} ${t}`),
  fail: (t) => console.log(`  ${c.red}✗${c.reset} ${t}`),
  info: (t) => console.log(`  ${c.dim}${t}${c.reset}`),
};

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return {
    code: r.status ?? 1,
    out: (r.stdout ?? "") + (r.stderr ?? ""),
  };
}

const alreadyExists = (out) =>
  /already exists/i.test(out) || /409/.test(out) || /duplicate/i.test(out);

// ─── 1. Pre-flight checks ────────────────────────────────────────────────
log.header("Pre-flight");

if (!existsSync(".dev.vars")) {
  log.skip(
    ".dev.vars not found — copy from .dev.vars.example before `npm run dev`",
  );
} else {
  const dv = readFileSync(".dev.vars", "utf8");
  if (/^\s*API_TOKEN\s*=\s*\S+/m.test(dv)) {
    log.ok(".dev.vars has API_TOKEN");
  } else {
    log.skip(".dev.vars exists but API_TOKEN is empty");
  }
}

const wr = readFileSync("wrangler.jsonc", "utf8");
if (wr.includes("REPLACE_WITH_YOUR_CLOUDFLARE_ACCOUNT_ID")) {
  log.skip(
    "wrangler.jsonc still has placeholder ACCOUNT_ID — fill it in (see README)",
  );
} else {
  log.ok("wrangler.jsonc ACCOUNT_ID is filled in");
}

// ─── 2. R2 bucket ────────────────────────────────────────────────────────
log.header(`R2 bucket: ${BUCKET}`);
{
  const r = run("npx", ["wrangler", "r2", "bucket", "create", BUCKET]);
  if (r.code === 0) log.ok("created");
  else if (alreadyExists(r.out)) log.skip("already exists");
  else {
    log.fail("failed");
    log.info(r.out.trim());
  }
}

// ─── 3. Vectorize index ──────────────────────────────────────────────────
log.header(`Vectorize index: ${VECTORIZE}`);
{
  const r = run("npx", [
    "wrangler",
    "vectorize",
    "create",
    VECTORIZE,
    `--dimensions=${VECTOR_DIM}`,
    "--metric=cosine",
  ]);
  if (r.code === 0) log.ok(`created (${VECTOR_DIM}-dim, cosine)`);
  else if (alreadyExists(r.out)) log.skip("already exists");
  else {
    log.fail("failed");
    log.info(r.out.trim());
  }
}

// ─── 4. Seed skills ──────────────────────────────────────────────────────
log.header(`Seed ${SKILLS_DIR}/ → r2:${BUCKET}/skills/`);
{
  const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    log.skip(`no .md files in ${SKILLS_DIR}/`);
  }
  for (const f of files) {
    const r = run("npx", [
      "wrangler",
      "r2",
      "object",
      "put",
      `${BUCKET}/skills/${f}`,
      "--file",
      join(SKILLS_DIR, f),
      "--remote",
    ]);
    if (r.code === 0) log.ok(`skills/${f}`);
    else {
      log.fail(`skills/${f}`);
      log.info(r.out.trim());
    }
  }
}

// ─── 5. Next steps ───────────────────────────────────────────────────────
console.log(`\n${c.bold}Next${c.reset}`);
console.log(
  `  ${c.dim}•${c.reset} Local dev:  ${c.cyan}npm run dev${c.reset}`,
);
console.log(
  `  ${c.dim}•${c.reset} Push prod secret:  ${c.cyan}npx wrangler secret put API_TOKEN${c.reset}`,
);
console.log(
  `  ${c.dim}•${c.reset} Deploy:  ${c.cyan}npm run deploy${c.reset}\n`,
);
