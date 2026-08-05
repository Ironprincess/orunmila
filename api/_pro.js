// api/_pro.js — shared helpers for Orunmila Pro.
// Underscore prefix = not exposed as an endpoint; required by the pro-* functions.
// Zero npm dependencies: talks to Upstash over REST, uses built-in crypto/fetch.

const crypto = require("crypto");

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// Run a single Redis command, e.g. redis("SET", "key", "value", "EX", "60")
async function redis(...args) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.map(String)),
  });
  if (!res.ok) throw new Error(`Redis ${args[0]} failed: ${res.status}`);
  const data = await res.json();
  return data.result;
}

// ── Limits ───────────────────────────────────────────────────────────
const LIMITS = {
  perIpDaily: 60,
  perCodeDaily: { monthly: 2500, annual: 300, cohort: 2500 },
};

const dayStamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

function ipHash(ip) {
  return crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 16);
}

function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

function getIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (
    (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    "unknown"
  );
}

// Vercel usually parses JSON bodies; this covers the cases where it doesn't.
function getBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    return {};
  }
}

// ── Access codes ─────────────────────────────────────────────────────
async function validateCode(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return { valid: false, expired: false };
  const rec = await redis("GET", `pro:code:${code}`);
  if (!rec) return { valid: false, expired: false };
  let data;
  try {
    data = JSON.parse(rec);
  } catch {
    return { valid: false, expired: false };
  }
  const expired = Date.now() > Number(data.expiresAt);
  return { valid: !expired, expired, code, ...data };
}

async function checkLimits(code, ip, type) {
  const day = dayStamp();
  const ipKey = `pro:rl:${code}:${ipHash(ip)}:${day}`;
  const codeKey = `pro:rl:${code}:all:${day}`;

  const ipCount = Number(await redis("INCR", ipKey));
  const codeCount = Number(await redis("INCR", codeKey));
  if (ipCount === 1) await redis("EXPIRE", ipKey, 60 * 60 * 26);
  if (codeCount === 1) await redis("EXPIRE", codeKey, 60 * 60 * 26);

  if (ipCount > LIMITS.perIpDaily) return { ok: false, reason: "daily-limit" };

  const cap = LIMITS.perCodeDaily[type] || 300;
  if (codeCount > cap) {
    await redis(
      "SET",
      `pro:flag:${code}`,
      JSON.stringify({ day, codeCount }),
      "EX",
      60 * 60 * 24 * 30
    );
    return { ok: false, reason: "code-limit" };
  }
  return { ok: true };
}

// ── Admin helpers ────────────────────────────────────────────────────
function generateCode(prefix) {
  const block = () =>
    crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
  return `${prefix}-${block()}-${block()}`;
}

async function createCode({ code, type, days, label }) {
  const finalCode =
    normalizeCode(code) || generateCode(type === "cohort" ? "CLASS" : "ORN");
  const exp = Date.now() + Number(days || 35) * 24 * 60 * 60 * 1000;
  const record = { type, expiresAt: exp, label: label || "" };
  // TTL = expiry + 60-day grace so expired codes show the renewal screen
  const ttl = Math.max(
    60,
    Math.floor((exp - Date.now()) / 1000) + 60 * 60 * 24 * 60
  );
  await redis("SET", `pro:code:${finalCode}`, JSON.stringify(record), "EX", ttl);
  await redis("SADD", "pro:codes:index", finalCode);
  return { code: finalCode, ...record };
}

async function listCodes() {
  const codes = (await redis("SMEMBERS", "pro:codes:index")) || [];
  const out = [];
  for (const c of codes) {
    const rec = await redis("GET", `pro:code:${c}`);
    if (rec) {
      try {
        const data = JSON.parse(rec);
        out.push({
          code: c,
          ...data,
          expired: Date.now() > Number(data.expiresAt),
        });
      } catch {}
    }
  }
  return out.sort((a, b) => b.expiresAt - a.expiresAt);
}

async function revokeCode(rawCode) {
  const code = normalizeCode(rawCode);
  await redis("DEL", `pro:code:${code}`);
  await redis("SREM", "pro:codes:index", code);
  return { code, revoked: true };
}

module.exports = {
  redis,
  validateCode,
  checkLimits,
  createCode,
  listCodes,
  revokeCode,
  normalizeCode,
  getIp,
  getBody,
};
