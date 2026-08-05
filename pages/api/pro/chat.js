// pages/api/pro/chat.js — the mode router.
// Access check → rate limits → injection filter → mode prompt → Anthropic → log.
// Mirrors the hardening pattern of your existing /api/chat, tagged by mode.

import { redis } from "../../../lib/redis";
import { validateCode, checkLimits } from "../../../lib/access";
import { buildSystemPrompt } from "../../../lib/prompts/base";
import { MODES } from "../../../lib/prompts/modes";

const MODEL = process.env.ORUNMILA_MODEL || "claude-sonnet-4-6";

// Same class of patterns your existing filter catches.
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous/i,
  /disregard\s+(your|all|previous)/i,
  /you\s+are\s+now\b/i,
  /\bact\s+as\b(?!\s+(a\s+)?(guide|reference))/i,
  /system\s*prompt/i,
  /\bjailbreak\b/i,
  /\bDAN\b/,
  /developer\s+mode/i,
  /reveal\s+your\s+(instructions|rules|prompt)/i,
];

function getIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (Array.isArray(fwd) ? fwd[0] : (fwd || "")).split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { code, mode, messages, upsellAllowed = true, tokenEstimate } = req.body || {};

    // 1 — Access
    const access = await validateCode(code);
    if (!access.valid) {
      return res.status(403).json({ error: access.expired ? "expired" : "invalid" });
    }

    // 2 — Mode
    const modePrompt = MODES[mode];
    if (!modePrompt) return res.status(400).json({ error: "Unknown mode" });

    // 3 — Message shape
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
      return res.status(400).json({ error: "Bad messages" });
    }
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = String(lastUser?.content || "").slice(0, 12000);
    if (!userText.trim()) return res.status(400).json({ error: "Empty message" });

    // 4 — Rate limits
    const ip = getIp(req);
    const limits = await checkLimits(access.code, ip, access.type);
    if (!limits.ok) {
      return res.status(429).json({
        error: "limit",
        message:
          limits.reason === "daily-limit"
            ? "You've reached today's practice limit. Orunmila will be ready again tomorrow."
            : "This access code has hit its daily limit. If you think that's a mistake, contact Right AI™.",
      });
    }

    // 5 — Injection filter
    if (INJECTION_PATTERNS.some((p) => p.test(userText))) {
      return res.status(200).json({
        reply: "I'm only able to help with Right AI™ practice work. What would you like to work on?",
        filtered: true,
      });
    }

    // 6 — Build and call
    const system = buildSystemPrompt(modePrompt, upsellAllowed);
    const cleanMessages = messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));

    if (mode === "tokens" && tokenEstimate) {
      cleanMessages[cleanMessages.length - 1] = {
        role: "user",
        content: `${userText}\n\n[Client token estimate for the pasted text: ~${Number(tokenEstimate)} tokens]`,
      };
    }

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system,
        messages: cleanMessages,
      }),
    });

    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      console.error("Anthropic error", apiRes.status, errBody.slice(0, 300));
      return res.status(502).json({ error: "Orunmila is briefly unavailable. Try again in a moment." });
    }

    const data = await apiRes.json();
    const reply = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    // 7 — Anonymous, mode-tagged logging (same policy as the student app:
    // question text only, no name, no email, no raw IP).
    redis
      .lpush(
        "pro:log",
        JSON.stringify({ ts: Date.now(), mode, q: userText.slice(0, 500) })
      )
      .then(() => redis.ltrim("pro:log", 0, 9999))
      .catch(() => {});

    return res.status(200).json({ reply });
  } catch (e) {
    console.error("pro chat error", e);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
}
