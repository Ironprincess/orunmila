// lib/access.js — the unified expiry model.
// Every kind of access (monthly subscriber, annual buyer, class cohort) is a
// code with an expiration date, stored at pro:code:{CODE}.
//
// Record shape: { type: "monthly" | "annual" | "cohort", expiresAt: <ms epoch>, label: string }

import crypto from "crypto";
import { redis } from "./redis";

// ── Limits (tune freely) ─────────────────────────────────────────────
const LIMITS = {
  // Per person (IP) per day, per code. Nobody legitimate hits this.
  perIpDaily: 60,
  // Circuit breaker per code per day, across all IPs.
  // Shared monthly codes get headroom; personal codes are tight.
  perCodeDaily: { monthly: 2500, annual: 300, cohort: 2500 },
};

const dayStamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

// Hash IPs before they touch Redis — consistent with Orunmila's
// anonymous-by-default privacy policy.
export function ipHash(ip) {
  return crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 16);
}

export function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

// Validate a code. Returns { valid, expired, type, expiresAt, label }.
export async function validateCode(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return { valid: false, expired: false };
  const rec = await redis.get(`pro:code:${code}`);
  if (!rec) return { valid: false, expired: false };
  const data = typeof rec === "string" ? JSON.parse(rec) : rec;
  const expired = Date.now() > Number(data.expiresAt);
  return { valid: !expired, expired, code, ...data };
}

// Rate limiting. Returns { ok, reason? }. Flags suspected leaks instead of
// silently eating them so a human decides what to do.
export async function checkLimits(code, ip, type) {
  const day = dayStamp();
  const ipKey = `pro:rl:${code}:${ipHash(ip)}:${day}`;
  const codeKey = `pro:rl:${code}:all:${day}`;

  const [ipCount, codeCount] = await Promise.all([
    redis.incr(ipKey),
    redis.incr(codeKey),
  ]);
  // First increment of the day sets the TTL.
  if (ipCount === 1) await redis.expire(ipKey, 60 * 60 * 26);
  if (codeCount === 1) await redis.expire(codeKey, 60 * 60 * 26);

  if (ipCount > LIMITS.perIpDaily) {
    return { ok: false, reason: "daily-limit" };
  }
  const cap = LIMITS.perCodeDaily[type] || 300;
  if (codeCount > cap) {
    // Suspected leak — flag for the weekly report, block further use today.
    await redis.set(`pro:flag:${code}`, JSON.stringify({ day, codeCount }), {
      ex: 60 * 60 * 24 * 30,
    });
    return { ok: false, reason: "code-limit" };
  }
  return { ok: true };
}

// Admin helpers ────────────────────────────────────────────────────────
export function generateCode(prefix = "ORN") {
  const block = () =>
    crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
  return `${prefix}-${block()}-${block()}`;
}

export async function createCode({ code, type, days, expiresAt, label }) {
  const finalCode = normalizeCode(code) || generateCode(type === "cohort" ? "CLASS" : "ORN");
  const exp = expiresAt
    ? Number(expiresAt)
    : Date.now() + Number(days || 35) * 24 * 60 * 60 * 1000;
  const record = { type, expiresAt: exp, label: label || "" };
  // Redis TTL = expiry + 60-day grace so the expired screen can say
  // "your code expired" instead of "invalid code".
  const ttlSeconds = Math.max(60, Math.floor((exp - Date.now()) / 1000) + 60 * 60 * 24 * 60);
  await redis.set(`pro:code:${finalCode}`, JSON.stringify(record), { ex: ttlSeconds });
  await redis.sadd("pro:codes:index", finalCode);
  return { code: finalCode, ...record };
}

export async function listCodes() {
  const codes = (await redis.smembers("pro:codes:index")) || [];
  const out = [];
  for (const c of codes) {
    const rec = await redis.get(`pro:code:${c}`);
    if (rec) {
      const data = typeof rec === "string" ? JSON.parse(rec) : rec;
      out.push({ code: c, ...data, expired: Date.now() > Number(data.expiresAt) });
    }
  }
  return out.sort((a, b) => b.expiresAt - a.expiresAt);
}

export async function revokeCode(rawCode) {
  const code = normalizeCode(rawCode);
  await redis.del(`pro:code:${code}`);
  await redis.srem("pro:codes:index", code);
  return { code, revoked: true };
}
