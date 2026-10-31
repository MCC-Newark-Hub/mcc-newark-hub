// Vercel Cron endpoint: exports every table to a single dated JSON snapshot in
// Supabase Storage (private "db-backups" bucket). Free-tier stand-in for managed
// backups — Supabase's own automatic backups require a paid plan. This protects
// against app/data bugs (silently failed writes, accidental bad edits) by giving a
// point to restore individual rows from; it does NOT protect against a Supabase
// platform outage or the project itself being deleted, since the backup lives in
// the same project.
//
// Restore is manual: download the JSON for the date you need, find the row(s),
// and re-insert/update via the Supabase SQL editor or REST API. There's no
// one-click restore script — the data is preserved, not automated recovery.
//
// Supports ?dryRun=true, which reports what would be backed up (row counts, size)
// without uploading or pruning anything.

// The table list comes from PostgREST's own schema description, not a hard-coded
// array: a fixed list went stale (it covered 14 of 34 tables) every time a feature
// added a table. Only paths that accept POST are taken, which keeps read-only views
// (aggregates rebuilt from the tables anyway) out of the snapshot.
async function listTables(baseUrl, headers) {
  const r = await fetch(`${baseUrl}/rest/v1/`, { headers });
  if (!r.ok) throw new Error(`schema_fetch_failed:${r.status}`);
  const spec = await r.json();
  return Object.entries(spec.paths || {})
    .filter(([path, ops]) => path !== "/" && !path.startsWith("/rpc/") && ops.post)
    .map(([path]) => ({
      name: path.slice(1),
      hasId: !!spec.definitions?.[path.slice(1)]?.properties?.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// PostgREST caps every response (1000 rows on Supabase), so a plain select=* quietly
// truncates large tables such as praise_songs. Page through until a short page.
const PAGE = 1000;
async function fetchAllRows(baseUrl, headers, { name, hasId }) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const order = hasId ? "&order=id.asc" : "";
    const r = await fetch(`${baseUrl}/rest/v1/${name}?select=*${order}&limit=${PAGE}&offset=${offset}`, { headers });
    if (!r.ok) return { error: r.status };
    const page = await r.json();
    rows.push(...page);
    if (page.length < PAGE) return { rows };
  }
}

const BUCKET = "db-backups";
const RETENTION_DAYS = 30;

export default async function handler(req, res) {
  const CRON_SECRET = process.env.CRON_SECRET;
  // Fail closed: a deployment without CRON_SECRET must refuse every caller, not accept all of them.
  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dryRun = req.query?.dryRun === "true";

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    res.status(500).json({ error: "server_not_configured" });
    return;
  }

  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

  try {
    const snapshot = { takenAt: new Date().toISOString(), tables: {} };
    const counts = {};
    const failures = [];

    for (const table of await listTables(SUPABASE_URL, headers)) {
      const { rows, error } = await fetchAllRows(SUPABASE_URL, headers, table);
      if (error) {
        failures.push({ table: table.name, status: error });
        continue;
      }
      snapshot.tables[table.name] = rows;
      counts[table.name] = rows.length;
    }

    const body = JSON.stringify(snapshot);
    const sizeBytes = Buffer.byteLength(body);
    const dateStr = new Date().toISOString().slice(0, 10);
    const path = `backups/${dateStr}.json`;

    let uploaded = false;
    let pruned = [];

    if (!dryRun) {
      const upload = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json", "x-upsert": "true" },
          body,
        }
      );
      if (!upload.ok) {
        res.status(502).json({ error: "upload_failed", status: upload.status, detail: await upload.text().catch(() => null) });
        return;
      }
      uploaded = true;

      // Retention: list existing backups, delete anything past RETENTION_DAYS so
      // storage usage stays bounded (free tier is 1GB) without manual upkeep.
      const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: "backups/", limit: 1000 }),
      });
      if (listRes.ok) {
        const objects = await listRes.json();
        const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
        const toDelete = (objects || [])
          .filter((o) => {
            const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(o.name);
            if (!m) return false;
            return new Date(m[1] + "T00:00:00Z").getTime() < cutoff;
          })
          .map((o) => `backups/${o.name}`);
        if (toDelete.length > 0) {
          const delRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
            method: "DELETE",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ prefixes: toDelete }),
          });
          if (delRes.ok) pruned = toDelete;
        }
      }
    }

    res.status(200).json({ dryRun, path, uploaded, sizeBytes, counts, failures, pruned, retentionDays: RETENTION_DAYS });
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
