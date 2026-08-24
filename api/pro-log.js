// api/pro-log.js — read the anonymous Pro question log for the admin page.
// Protected by the same ORUNMILA_ADMIN_SECRET as the codes endpoint.
// GET  -> recent questions as JSON (and CSV if ?format=csv)
const { redis, getBody } = require("./_pro");

module.exports = async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.ORUNMILA_ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    // newest first; cap what we return so the page stays fast
    const limit = Math.min(Number(req.query && req.query.limit) || 500, 2000);
    const raw = (await redis("LRANGE", "pro:log", 0, limit - 1)) || [];
    const items = raw
      .map((r) => { try { return JSON.parse(r); } catch { return null; } })
      .filter(Boolean);

    if (req.query && req.query.format === "csv") {
      const esc = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
      const rows = [["timestamp", "mode", "question"].map(esc).join(",")];
      items.forEach((it) => {
        rows.push([new Date(it.ts).toISOString(), it.mode || "", it.q || ""].map(esc).join(","));
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="orunmila-pro-questions.csv"');
      return res.status(200).send(rows.join("\n"));
    }

    return res.status(200).json({ count: items.length, items });
  } catch (e) {
    console.error("pro-log error", e);
    return res.status(500).json({ error: "Could not read the question log" });
  }
};
