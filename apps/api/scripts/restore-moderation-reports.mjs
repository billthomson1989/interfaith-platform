import fs from "node:fs";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL || "postgresql://interfaith:interfaith@localhost:5432/interfaith";
const inPath = process.env.IN || process.argv[2];

if (!inPath) {
  console.error("Usage: IN=/path/to/backup.json npm --workspace @interfaith/api run restore:moderation");
  process.exit(1);
}

const raw = fs.readFileSync(inPath, "utf8");
const parsed = JSON.parse(raw);
const reports = Array.isArray(parsed) ? parsed : (parsed.reports || []);

const client = new Client({ connectionString });

try {
  await client.connect();
  await client.query("begin");

  let upserted = 0;
  for (const r of reports) {
    if (!r?.id) continue;
    await client.query(
      `insert into moderation_reports(id, session_id, reporter_user_id, target_user_id, category, notes, created_at)
       values($1,$2,$3,$4,$5,$6,$7)
       on conflict(id) do update set
         session_id = excluded.session_id,
         reporter_user_id = excluded.reporter_user_id,
         target_user_id = excluded.target_user_id,
         category = excluded.category,
         notes = excluded.notes,
         created_at = excluded.created_at`,
      [
        r.id,
        r.sessionId ?? r.session_id ?? null,
        r.reporterUserId ?? r.reporter_user_id ?? "unknown",
        r.targetUserId ?? r.target_user_id ?? null,
        r.category ?? "other",
        r.notes ?? "",
        r.createdAt ?? r.created_at ?? new Date().toISOString()
      ]
    );
    upserted += 1;
  }

  await client.query("commit");
  console.log(`✅ Restored ${upserted} moderation reports from ${inPath}`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end().catch(() => {});
}
