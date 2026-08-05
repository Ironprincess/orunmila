// pages/api/pro/library.js — "My Library" of saved prompts.
// Keyed to a client-generated memberId (kept in the browser), NOT the access
// code — monthly codes are shared, and libraries must never be. The memberId
// survives monthly code rotation, so saved work persists as long as they
// subscribe. 90-day rolling TTL, refreshed on every save.

import { redis } from "../../../lib/redis";
import { validateCode } from "../../../lib/access";

const MAX_ITEMS = 50;
const TTL = 60 * 60 * 24 * 90;

function keyFor(memberId) {
  const safe = String(memberId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return safe.length >= 8 ? `pro:lib:${safe}` : null;
}

export default async function handler(req, res) {
  try {
    const { code, memberId } = req.method === "GET" ? req.query : req.body || {};
    const access = await validateCode(code);
    if (!access.valid) return res.status(403).json({ error: "invalid" });

    const key = keyFor(memberId);
    if (!key) return res.status(400).json({ error: "Bad member id" });

    if (req.method === "GET") {
      const items = (await redis.lrange(key, 0, MAX_ITEMS - 1)) || [];
      return res.status(200).json({
        items: items.map((i) => (typeof i === "string" ? JSON.parse(i) : i)),
      });
    }

    if (req.method === "POST") {
      const { title, content, mode } = req.body || {};
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
      await redis.lpush(key, JSON.stringify(item));
      await redis.ltrim(key, 0, MAX_ITEMS - 1);
      await redis.expire(key, TTL);
      return res.status(200).json({ saved: true, item });
    }

    if (req.method === "DELETE") {
      const { id } = req.body || {};
      const items = (await redis.lrange(key, 0, MAX_ITEMS - 1)) || [];
      const keep = items.filter((i) => {
        const parsed = typeof i === "string" ? JSON.parse(i) : i;
        return parsed.id !== id;
      });
      await redis.del(key);
      if (keep.length) {
        await redis.rpush(key, ...keep.map((i) => (typeof i === "string" ? i : JSON.stringify(i))));
        await redis.expire(key, TTL);
      }
      return res.status(200).json({ deleted: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("library error", e);
    return res.status(500).json({ error: "Library unavailable" });
  }
}
