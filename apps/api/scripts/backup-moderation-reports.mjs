import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL || "postgresql://interfaith:interfaith@localhost:5432/interfaith";
const outPath = process.env.OUT || path.join(process.cwd(), "moderation-reports-backup.json");

const client = new Client({ connectionString });

try {
  await client.connect();
  const { rows } = await client.query(`
    select id, session_id, reporter_user_id, target_user_id, category, notes, created_at
    from moderation_reports
    order by created_at asc
  `);

  const payload = {
    exportedAt: new Date().toISOString(),
    count: rows.length,
    reports: rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      reporterUserId: r.reporter_user_id,
      targetUserId: r.target_user_id,
      category: r.category,
      notes: r.notes,
      createdAt: r.created_at
    }))
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`✅ Exported ${rows.length} moderation reports to ${outPath}`);
} finally {
  await client.end().catch(() => {});
}
