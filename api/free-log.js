// api/free-log.js — read the free student app's anonymous question log.
// The free app (api/chat.js -> logToUpstash) writes to the "question_log"
// list, each entry: { timestamp: <ISO string>, question: <text> }.
// Protected by the same ORUNMILA_ADMIN_SECRET as the Pro admin.
// GET -> recent questions as JSON (and CSV if ?format=csv)

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(command, ...args) {
  // Uses the REST path style the free app uses: /lrange/key/start/stop
  const path = [command, ...args].map(encodeURIComponent).join("/");
  const res = await fetch(`${REDIS_URL}/${path}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  if (!res.ok) throw new Error("Redis " + command + " failed: " + res.status);
  const data = await res.json();
  return data.result;
}

module.exports = async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.ORUNMILA_ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const limit = Math.min(Number(req.query && req.query.limit) || 500, 2000);
    const raw = (await redis("lrange", "question_log", "0", String(limit - 1))) || [];
    const items = raw
      .map((r) => { try { return JSON.parse(r); } catch { return null; } })
      .filter(Boolean)
      // normalise to {ts, q} so the page is simple
      .map((it) => ({ ts: it.timestamp || it.ts || null, q: it.question || it.q || "" }));

    if (req.query && req.query.format === "csv") {
      const esc = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
      const rows = [["timestamp", "question"].map(esc).join(",")];
      items.forEach((it) => { rows.push([it.ts || "", it.q || ""].map(esc).join(",")); });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="orunmila-free-questions.csv"');
      return res.status(200).send(rows.join("\n"));
    }

    return res.status(200).json({ count: items.length, items });
  } catch (e) {
    console.error("free-log error", e);
    return res.status(500).json({ error: "Could not read the question log" });
  }
};
