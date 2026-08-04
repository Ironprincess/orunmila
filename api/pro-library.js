// api/pro-library.js — "My Library" of saved prompts.
// Keyed to a browser-held memberId, NOT the access code — monthly codes are
// shared, libraries must never be. Survives monthly code rotation. 90-day
// rolling TTL, refreshed on every save.
const { redis, validateCode, getBody } = require("./_pro");

const MAX_ITEMS = 50;
const TTL = 60 * 60 * 24 * 90;

function keyFor(memberId) {
  const safe = String(memberId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return safe.length >= 8 ? "pro:lib:" + safe : null;
}

module.exports = async (req, res) => {
  try {
    const params = req.method === "GET" ? (req.query || {}) : getBody(req);
    const access = await validateCode(params.code);
    if (!access.valid) return res.status(403).json({ error: "invalid" });

    const key = keyFor(params.memberId);
    if (!key) return res.status(400).json({ error: "Bad member id" });

    if (req.method === "GET") {
      const items = (await redis("LRANGE", key, 0, MAX_ITEMS - 1)) || [];
      return res.status(200).json({
        items: items.map((i) => { try { return JSON.parse(i); } catch { return null; } }).filter(Boolean),
      });
    }

    if (req.method === "POST") {
      const { title, content, mode } = params;
      if (!content || String(content).length > 20000) {
        return res.status(400).json({ error: "Bad content" });
      }
      const item = {
        id: Date.now().toString(36),
        ts: Date.now(),
        mode: String(mode || "").slice(0, 20),
        title: String(title || "Untitled").slice(0, 120),
        content: String(content),
      };
      await redis("LPUSH", key, JSON.stringify(item));
      await redis("LTRIM", key, 0, MAX_ITEMS - 1);
      await redis("EXPIRE", key, TTL);
      return res.status(200).json({ saved: true, item });
    }

    if (req.method === "DELETE") {
      const { id } = params;
      const items = (await redis("LRANGE", key, 0, MAX_ITEMS - 1)) || [];
      const keep = items.filter((i) => {
        try { return JSON.parse(i).id !== id; } catch { return false; }
      });
      await redis("DEL", key);
      for (let j = keep.length - 1; j >= 0; j--) {
        await redis("LPUSH", key, keep[j]);
      }
      if (keep.length) await redis("EXPIRE", key, TTL);
      return res.status(200).json({ deleted: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("library error", e);
    return res.status(500).json({ error: "Library unavailable" });
  }
};
