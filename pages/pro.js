// pages/pro.js — Orunmila Pro.
// Screens: gate (code entry) → practice floor (modes + chat) | expired (renewal).
// Fill in the two SQUARESPACE_* constants before launch.

import { useEffect, useRef, useState } from "react";
import Head from "next/head";

const SQUARESPACE_MONTHLY_URL = "https://www.ovetta-sampson.com/#monthly"; // TODO: real product URL
const SQUARESPACE_ANNUAL_URL = "https://www.ovetta-sampson.com/#annual"; // TODO: real product URL
const CLASS_URL = "https://www.ovetta-sampson.com/mindfulai-masterclass-series";

const MODES = [
  {
    id: "assess",
    title: "Prompt Assessment",
    desc: "Paste a prompt. Get it scored against CO-STAR™ with one targeted fix.",
    placeholder: "Paste the prompt you want assessed…",
    intro: "Paste any prompt you've written and I'll score it against all six CO-STAR™ dimensions, then give you the one fix that matters most.",
    live: true,
  },
  {
    id: "costar",
    title: "CO-STAR Builder",
    desc: "Build a complete prompt, one dimension at a time, with pushback.",
    placeholder: "Tell me what you want your prompt to accomplish…",
    intro: "Let's build your prompt together — Context first. What's the situation the AI needs to understand before it does anything?",
    live: true,
  },
  {
    id: "tokens",
    title: "Token & Context Check",
    desc: "See what's eating your context window and where to trim.",
    placeholder: "Paste a prompt, system prompt, or document to check…",
    intro: "Paste your prompt or document and I'll show you what's consuming your context window — and your top two trims.",
    live: true,
  },
  { id: "space", title: "SPACE™ Starter", desc: "Draft a working system prompt skeleton, dimension by dimension.", live: false },
  { id: "docs", title: "Behavior Doc & Knowledge Brief", desc: "Templates for behavior.md and knowledge briefs, with review.", live: false },
  { id: "drills", title: "Constitution Drills", desc: "Weekly flawed-constitution drills. Find the flaw, fix it, get scored.", live: false },
];

const estimateTokens = (text) => Math.max(1, Math.round((text || "").length / 4));

function newMemberId() {
  return "m" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Minimal renderer: fenced code blocks + paragraphs.
function Reply({ text, onSave }) {
  const parts = String(text).split(/```(?:\w*\n)?/);
  return (
    <div>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <div className="codewrap" key={i}>
            <pre>{part.trim()}</pre>
            {onSave && (
              <button className="save-btn" onClick={() => onSave(part.trim())}>
                Save To Library
              </button>
            )}
          </div>
        ) : (
          part
            .split(/\n{2,}/)
            .filter((p) => p.trim())
            .map((p, j) => <p key={`${i}-${j}`}>{p.trim()}</p>)
        )
      )}
      <style jsx>{`
        p { margin: 0 0 10px; white-space: pre-wrap; }
        .codewrap { position: relative; margin: 10px 0; }
        pre { background: #0e2b33; color: #f4eee6; padding: 16px; padding-bottom: 40px; border-radius: 10px; font-size: 13px; overflow-x: auto; white-space: pre-wrap; margin: 0; }
        .save-btn { position: absolute; bottom: 10px; right: 10px; background: #dd7f41; color: #fff; border: none; border-radius: 6px; padding: 5px 12px; font-size: 12px; font-family: "DM Sans", sans-serif; cursor: pointer; }
        .save-btn:hover { filter: brightness(1.08); }
      `}</style>
    </div>
  );
}

export default function OrunmilaPro() {
  const [screen, setScreen] = useState("gate"); // gate | active | expired
  const [code, setCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [gateMsg, setGateMsg] = useState("");
  const [expiresAt, setExpiresAt] = useState(null);
  const [memberId, setMemberId] = useState("");

  const [activeMode, setActiveMode] = useState(null);
  const [threads, setThreads] = useState({}); // modeId -> [{role, content}]
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [upsellSpent, setUpsellSpent] = useState(false);

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState([]);
  const [toast, setToast] = useState("");
  const scrollRef = useRef(null);

  // Restore session
  useEffect(() => {
    const savedCode = localStorage.getItem("orn_pro_code");
    let mid = localStorage.getItem("orn_pro_member");
    if (!mid) {
      mid = newMemberId();
      localStorage.setItem("orn_pro_member", mid);
    }
    setMemberId(mid);
    if (savedCode) {
      setCodeInput(savedCode);
      unlock(savedCode, mid, true);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [threads, busy]);

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };

  async function unlock(rawCode, mid, silent) {
    const c = (rawCode || "").trim().toUpperCase();
    if (!c) return;
    if (!silent) setGateMsg("Checking…");
    const res = await fetch("/api/pro/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: c }),
    }).then((r) => r.json());

    if (res.valid) {
      setCode(c);
      setExpiresAt(res.expiresAt);
      localStorage.setItem("orn_pro_code", c);
      setScreen("active");
      setGateMsg("");
    } else if (res.expired) {
      setCode(c);
      setScreen("expired");
    } else if (!silent) {
      setGateMsg("That code isn't recognized. Check for typos, or use the links below to get access.");
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || !activeMode) return;
    const mode = activeMode;
    const history = threads[mode.id] || [];
    const nextHistory = [...history, { role: "user", content: text }];
    setThreads({ ...threads, [mode.id]: nextHistory });
    setInput("");
    setBusy(true);

    const allowUpsell = !upsellSpent && mode.id !== "costar";

    const res = await fetch("/api/pro/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        mode: mode.id,
        messages: nextHistory,
        upsellAllowed: allowUpsell,
        tokenEstimate: mode.id === "tokens" ? estimateTokens(text) : undefined,
      }),
    }).then((r) => r.json());

    setBusy(false);
    if (res.error === "expired") return setScreen("expired");
    if (res.error) {
      setThreads((t) => ({
        ...t,
        [mode.id]: [...nextHistory, { role: "assistant", content: res.message || "Something went wrong — try again in a moment." }],
      }));
      return;
    }
    if (allowUpsell) setUpsellSpent(true);
    setThreads((t) => ({ ...t, [mode.id]: [...nextHistory, { role: "assistant", content: res.reply }] }));
  }

  async function saveToLibrary(content) {
    const res = await fetch("/api/pro/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        memberId,
        mode: activeMode?.id,
        title: content.split("\n")[0].slice(0, 80),
        content,
      }),
    }).then((r) => r.json());
    flash(res.saved ? "Saved to your library" : "Couldn't save — try again");
  }

  async function openLibrary() {
    setLibraryOpen(true);
    const res = await fetch(`/api/pro/library?code=${encodeURIComponent(code)}&memberId=${encodeURIComponent(memberId)}`).then((r) => r.json());
    setLibrary(res.items || []);
  }

  async function deleteItem(id) {
    await fetch("/api/pro/library", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, memberId, id }),
    });
    setLibrary((l) => l.filter((i) => i.id !== id));
  }

  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000)) : null;
  const thread = activeMode ? threads[activeMode.id] || [] : [];

  return (
    <div className="page">
      <Head>
        <title>Orunmila Pro — Right AI™ Practice Coach</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      {/* ─── GATE ─── */}
      {screen === "gate" && (
        <div className="gate">
          <div className="eyebrow">Right AI™ · Practice Coach</div>
          <h1>
            Orunmila <span className="pro-mark">Pro</span>
          </h1>
          <p className="phonetic">oh-ROON-mee-lah</p>
          <p className="lede">
            A name drawn from Yoruba tradition, where Orunmila is the orisha of wisdom, knowledge, and clarity.
            This is the practice floor — where prompts get assessed, built, and sharpened against the Right AI™ frameworks.
          </p>
          <div className="gate-card">
            <label>Access Code</label>
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && unlock(codeInput, memberId)}
              placeholder="Enter your code"
              spellCheck={false}
            />
            <button onClick={() => unlock(codeInput, memberId)}>Enter The Practice Floor</button>
            {gateMsg && <p className="gate-msg">{gateMsg}</p>}
          </div>
          <p className="gate-links">
            No code yet? <a href={SQUARESPACE_MONTHLY_URL}>Subscribe Monthly</a> ·{" "}
            <a href={SQUARESPACE_ANNUAL_URL}>Get Annual Access</a>
            <br />
            Taking a Right AI™ class? Your cohort code is in your welcome email.
          </p>
        </div>
      )}

      {/* ─── EXPIRED ─── */}
      {screen === "expired" && (
        <div className="gate">
          <div className="eyebrow">Right AI™ · Practice Coach</div>
          <h1>Your Access Has Ended</h1>
          <p className="lede">
            Your code has expired — but your practice doesn't have to. Keep sharpening your prompts,
            your assessments, and your saved library with a subscription. Your saved work is waiting for you.
          </p>
          <div className="renew-row">
            <a className="renew-card" href={SQUARESPACE_MONTHLY_URL}>
              <div className="renew-title">Monthly</div>
              <div className="renew-desc">Full access, month to month. A new code lands in your inbox every month.</div>
              <div className="renew-cta">Subscribe Monthly →</div>
            </a>
            <a className="renew-card featured" href={SQUARESPACE_ANNUAL_URL}>
              <div className="renew-title">Annual</div>
              <div className="renew-desc">A full year with one personal code. Pay upfront or on a monthly payment plan.</div>
              <div className="renew-cta">Get Annual Access →</div>
            </a>
          </div>
          <p className="gate-links">
            Entered the wrong code?{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                localStorage.removeItem("orn_pro_code");
                setScreen("gate");
                setCodeInput("");
              }}
            >
              Try A Different Code
            </a>
          </p>
        </div>
      )}

      {/* ─── PRACTICE FLOOR ─── */}
      {screen === "active" && (
        <div className="floor">
          <header>
            <div>
              <div className="eyebrow">Right AI™ · Practice Coach</div>
              <div className="wordmark">
                Orunmila <span className="pro-mark">Pro</span>
              </div>
            </div>
            <div className="header-right">
              {daysLeft !== null && daysLeft <= 7 && (
                <span className="expiry-pill">Code Expires In {daysLeft} {daysLeft === 1 ? "Day" : "Days"}</span>
              )}
              <button className="ghost" onClick={openLibrary}>My Library</button>
            </div>
          </header>

          <div className="mode-rail">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`mode-card ${activeMode?.id === m.id ? "on" : ""} ${!m.live ? "locked" : ""}`}
                onClick={() => m.live && setActiveMode(m)}
                disabled={!m.live}
              >
                <div className="mode-title">{m.title}</div>
                <div className="mode-desc">{m.desc}</div>
                {!m.live && <div className="soon">Coming Soon</div>}
              </button>
            ))}
          </div>

          {!activeMode ? (
            <div className="empty">Choose a practice mode above to begin.</div>
          ) : (
            <div className="chat">
              <div className="messages" ref={scrollRef}>
                <div className="msg assistant">
                  <Reply text={activeMode.intro} />
                </div>
                {thread.map((m, i) => (
                  <div key={i} className={`msg ${m.role}`}>
                    {m.role === "assistant" ? (
                      <Reply text={m.content} onSave={activeMode.id === "costar" ? saveToLibrary : null} />
                    ) : (
                      <Reply text={m.content} />
                    )}
                  </div>
                ))}
                {busy && <div className="msg assistant thinking">Orunmila is thinking…</div>}
              </div>
              <div className="input-area">
                <textarea
                  rows={3}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
                  }}
                  placeholder={activeMode.placeholder}
                />
                <div className="input-footer">
                  <span className="hint">
                    {activeMode.id === "tokens" && input.trim()
                      ? `~${estimateTokens(input).toLocaleString()} Tokens`
                      : "Questions are stored anonymously to improve Right AI™ · Cmd+Enter To Send"}
                  </span>
                  <button onClick={send} disabled={busy}>Ask Orunmila</button>
                </div>
              </div>
            </div>
          )}

          {/* Library drawer */}
          {libraryOpen && (
            <div className="drawer-scrim" onClick={() => setLibraryOpen(false)}>
              <div className="drawer" onClick={(e) => e.stopPropagation()}>
                <div className="drawer-head">
                  <h2>My Library</h2>
                  <button className="ghost" onClick={() => setLibraryOpen(false)}>Close</button>
                </div>
                {library.length === 0 ? (
                  <p className="drawer-empty">
                    Nothing saved yet. Build a prompt in CO-STAR Builder and save it — it'll live here.
                  </p>
                ) : (
                  library.map((item) => (
                    <div className="lib-item" key={item.id}>
                      <div className="lib-title">{item.title}</div>
                      <div className="lib-meta">
                        {new Date(item.ts).toLocaleDateString()} · {item.mode}
                      </div>
                      <pre className="lib-content">{item.content}</pre>
                      <div className="lib-actions">
                        <button
                          className="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(item.content);
                            flash("Copied");
                          }}
                        >
                          Copy
                        </button>
                        <button className="ghost danger" onClick={() => deleteItem(item.id)}>Delete</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      <style jsx global>{`
        body { margin: 0; background: #f4eee6; color: #0e2b33; font-family: "DM Sans", sans-serif; }
        * { box-sizing: border-box; }
      `}</style>
      <style jsx>{`
        .page { min-height: 100vh; }
        .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #dd7f41; }
        h1, .wordmark { font-family: "DM Serif Display", serif; font-weight: 400; }
        .pro-mark { color: #dd7f41; font-style: italic; }

        /* Gate + expired */
        .gate { max-width: 560px; margin: 0 auto; padding: 72px 24px; text-align: center; }
        .gate h1 { font-size: 46px; margin: 14px 0 2px; }
        .phonetic { font-size: 13px; color: #8a8378; letter-spacing: 0.08em; margin: 0 0 18px; }
        .lede { font-size: 15px; line-height: 1.65; color: #3d4d52; }
        .gate-card { background: #fff; border-radius: 14px; padding: 26px; margin: 26px 0 18px; text-align: left; box-shadow: 0 2px 14px rgba(14, 43, 51, 0.06); }
        .gate-card label { display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #5c6b70; margin-bottom: 7px; }
        .gate-card input { width: 100%; padding: 13px 14px; border: 1.5px solid #d8cfc0; border-radius: 9px; font-size: 16px; font-family: monospace; letter-spacing: 0.06em; }
        .gate-card input:focus { outline: 2px solid #dd7f41; border-color: transparent; }
        .gate-card button, .input-area button { margin-top: 14px; width: 100%; background: #0e2b33; color: #fff; border: none; border-radius: 9px; padding: 13px; font-family: "DM Sans", sans-serif; font-size: 15px; font-weight: 500; cursor: pointer; transition: background 0.15s; }
        .gate-card button:hover { background: #dd7f41; }
        .gate-msg { font-size: 13px; color: #b0442a; margin: 10px 0 0; }
        .gate-links { font-size: 13px; color: #5c6b70; line-height: 1.9; }
        .gate-links a { color: #dd7f41; font-weight: 500; }

        .renew-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 28px 0 20px; }
        .renew-card { background: #fff; border-radius: 14px; padding: 22px; text-align: left; text-decoration: none; color: inherit; border: 1.5px solid transparent; transition: border 0.15s; }
        .renew-card:hover { border-color: #dd7f41; }
        .renew-card.featured { border-color: #dd7f41; }
        .renew-title { font-family: "DM Serif Display", serif; font-size: 21px; margin-bottom: 6px; }
        .renew-desc { font-size: 13px; line-height: 1.55; color: #3d4d52; margin-bottom: 14px; }
        .renew-cta { font-size: 13px; font-weight: 700; color: #dd7f41; }

        /* Floor */
        .floor { max-width: 860px; margin: 0 auto; padding: 30px 20px 60px; }
        header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; }
        .wordmark { font-size: 30px; }
        .header-right { display: flex; gap: 10px; align-items: center; }
        .expiry-pill { font-size: 12px; font-weight: 700; background: #dd7f41; color: #fff; border-radius: 20px; padding: 5px 12px; }
        .ghost { background: transparent; border: 1.5px solid #0e2b33; color: #0e2b33; border-radius: 8px; padding: 7px 15px; font-family: "DM Sans", sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; }
        .ghost:hover { background: #0e2b33; color: #fff; }
        .ghost.danger { border-color: #b0442a; color: #b0442a; }

        .mode-rail { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 26px; }
        .mode-card { text-align: left; background: #fff; border: 1.5px solid transparent; border-radius: 12px; padding: 16px; cursor: pointer; font-family: "DM Sans", sans-serif; transition: border 0.15s, transform 0.15s; position: relative; }
        .mode-card:hover:not(.locked) { border-color: #dd7f41; transform: translateY(-1px); }
        .mode-card.on { border-color: #0e2b33; background: #0e2b33; color: #f4eee6; }
        .mode-card.on .mode-desc { color: #cfd8da; }
        .mode-card.locked { opacity: 0.55; cursor: default; }
        .mode-title { font-family: "DM Serif Display", serif; font-size: 16px; margin-bottom: 5px; }
        .mode-desc { font-size: 12px; line-height: 1.5; color: #5c6b70; }
        .soon { position: absolute; top: 10px; right: 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #dd7f41; }

        .empty { text-align: center; padding: 60px 0; color: #8a8378; font-size: 15px; }
        .chat { background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 14px rgba(14, 43, 51, 0.06); }
        .messages { max-height: 460px; overflow-y: auto; padding: 22px; }
        .msg { font-size: 14px; line-height: 1.65; margin-bottom: 16px; max-width: 92%; }
        .msg.user { margin-left: auto; background: #f4eee6; border-radius: 12px 12px 2px 12px; padding: 12px 15px; }
        .msg.assistant { color: #24373d; }
        .msg.thinking { color: #8a8378; font-style: italic; }
        .input-area { border-top: 1px solid #eee5d8; padding: 14px 18px 16px; }
        textarea { width: 100%; border: none; resize: vertical; font-family: "DM Sans", sans-serif; font-size: 14px; line-height: 1.6; padding: 6px 2px; }
        textarea:focus { outline: none; }
        .input-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .hint { font-size: 11.5px; color: #8a8378; }
        .input-area button { width: auto; margin-top: 0; padding: 9px 20px; font-size: 13.5px; }
        .input-area button:hover { background: #dd7f41; }
        .input-area button:disabled { opacity: 0.5; cursor: default; }

        .drawer-scrim { position: fixed; inset: 0; background: rgba(14, 43, 51, 0.35); display: flex; justify-content: flex-end; z-index: 20; }
        .drawer { width: min(440px, 92vw); background: #fdfbf7; height: 100%; overflow-y: auto; padding: 24px; }
        .drawer-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .drawer h2 { font-family: "DM Serif Display", serif; font-weight: 400; font-size: 24px; margin: 0; }
        .drawer-empty { font-size: 14px; color: #5c6b70; line-height: 1.6; }
        .lib-item { background: #fff; border-radius: 10px; padding: 14px; margin-bottom: 12px; }
        .lib-title { font-weight: 700; font-size: 13.5px; margin-bottom: 2px; }
        .lib-meta { font-size: 11px; color: #8a8378; margin-bottom: 8px; }
        .lib-content { font-size: 12px; background: #f4eee6; border-radius: 8px; padding: 10px; max-height: 130px; overflow-y: auto; white-space: pre-wrap; margin: 0 0 10px; }
        .lib-actions { display: flex; gap: 8px; }

        .toast { position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%); background: #0e2b33; color: #f4eee6; border-radius: 24px; padding: 9px 20px; font-size: 13px; z-index: 30; }

        @media (max-width: 640px) {
          .mode-rail { grid-template-columns: 1fr; }
          .renew-row { grid-template-columns: 1fr; }
          .gate h1 { font-size: 36px; }
          header { flex-direction: column; align-items: flex-start; gap: 12px; }
        }
      `}</style>
    </div>
  );
}
