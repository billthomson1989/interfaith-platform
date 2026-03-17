import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = process.env.CITATIONS_FILE || path.join(__dirname, "..", "src", "data", "citations.json");

const connectionString = process.env.DATABASE_URL || "postgresql://interfaith:interfaith@localhost:5432/interfaith";

const raw = fs.readFileSync(dataPath, "utf8");
const parsed = JSON.parse(raw);

if (!Array.isArray(parsed)) {
  throw new Error("Citations seed file must be an array");
}

const normalize = (rawItem) => ({
  id: String(rawItem.id),
  tradition: String(rawItem.tradition || "unknown").toLowerCase(),
  reference: String(rawItem.reference || "").trim(),
  canonical_key: String(rawItem.canonical_key || rawItem.canonicalKey || "").trim(),
  text: String(rawItem.text || "").trim(),
  translation: String(rawItem.translation || "Unknown").trim(),
  source: String(rawItem.source || "Unknown").trim(),
  language: String(rawItem.language || "en").toLowerCase(),
  tags: Array.isArray(rawItem.tags) ? rawItem.tags.map((t) => String(t).toLowerCase()) : []
});

const citations = parsed.map(normalize).filter((c) => c.id && c.reference && c.canonical_key && c.text);

const client = new Client({ connectionString });

await client.connect();

await client.query(`
  create table if not exists citations (
    id text primary key,
    tradition text not null,
    reference text not null,
    canonical_key text not null,
    text text not null,
    translation text not null,
    source text not null,
    language text not null,
    tags jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
  )
`);

let count = 0;
for (const c of citations) {
  await client.query(
    `insert into citations(id, tradition, reference, canonical_key, text, translation, source, language, tags)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict(id) do update set
       tradition = excluded.tradition,
       reference = excluded.reference,
       canonical_key = excluded.canonical_key,
       text = excluded.text,
       translation = excluded.translation,
       source = excluded.source,
       language = excluded.language,
       tags = excluded.tags,
       updated_at = now()`,
    [c.id, c.tradition, c.reference, c.canonical_key, c.text, c.translation, c.source, c.language, JSON.stringify(c.tags)]
  );
  count += 1;
}

console.log(`Seeded ${count} citations from ${dataPath}`);
await client.end();
