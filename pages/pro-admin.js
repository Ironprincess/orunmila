// pages/pro-admin.js — the admin page referenced in the VA checklist.
// Enter the admin secret once; create, view, and revoke access codes.
import { useState } from "react";
import Head from "next/head";

export default function ProAdmin() {
  const [secret, setSecret] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [codes, setCodes] = useState([]);
  const [form, setForm] = useState({ type: "monthly", days: 35, label: "", code: "" });
  const [msg, setMsg] = useState("");

  const api = (method, body) =>
    fetch("/api/admin/codes", {
      method,
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => r.json());

  const load = async () => {
    const data = await api("GET");
    if (data.error) return setMsg(data.error === "Unauthorized" ? "Wrong secret." : data.error);
    setCodes(data.codes || []);
    setUnlocked(true);
    setMsg("");
  };

  const create = async () => {
    setMsg("Creating…");
    const data = await api("POST", {
      type: form.type,
      days: Number(form.days),
      label: form.label,
      code: form.code || undefined,
    });
    if (data.created) {
      setMsg(`Created: ${data.created.code} — expires ${new Date(data.created.expiresAt).toLocaleDateString()}`);
      setForm({ ...form, label: "", code: "" });
      load();
    } else setMsg(data.error || "Failed");
  };

  const revoke = async (code) => {
    if (!confirm(`Revoke ${code}? This locks out everyone using it immediately.`)) return;
    await api("DELETE", { code });
    load();
  };

  return (
    <div className="wrap">
      <Head>
        <title>Orunmila Pro — Admin</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <h1>Orunmila Pro · Code Admin</h1>

      {!unlocked ? (
        <div className="panel">
          <label>Admin Secret</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Paste the admin secret"
          />
          <button onClick={load}>Unlock</button>
          {msg && <p className="msg">{msg}</p>}
        </div>
      ) : (
        <>
          <div className="panel">
            <h2>Create A Code</h2>
            <div className="row">
              <div>
                <label>Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="monthly">Monthly (Shared Subscriber Code)</option>
                  <option value="annual">Annual (Personal 12-Month Code)</option>
                  <option value="cohort">Cohort (Class Code)</option>
                </select>
              </div>
              <div>
                <label>Days Until Expiry</label>
                <input
                  type="number"
                  value={form.days}
                  onChange={(e) => setForm({ ...form, days: e.target.value })}
                />
              </div>
            </div>
            <label>Label (For The Tracker — e.g., "Aug 2026 Monthly" or "Sept Cohort")</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <label>Custom Code (Optional — Leave Blank To Auto-Generate)</label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="e.g., SEPT2026"
            />
            <button onClick={create}>Create Code</button>
            {msg && <p className="msg">{msg}</p>}
          </div>

          <div className="panel">
            <h2>Active & Recent Codes</h2>
            <table>
              <thead>
                <tr><th>Code</th><th>Type</th><th>Label</th><th>Expires</th><th></th></tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.code} className={c.expired ? "expired" : ""}>
                    <td className="mono">{c.code}</td>
                    <td>{c.type}</td>
                    <td>{c.label}</td>
                    <td>
                      {new Date(c.expiresAt).toLocaleDateString()} {c.expired && "· EXPIRED"}
                    </td>
                    <td><button className="danger" onClick={() => revoke(c.code)}>Revoke</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <style jsx>{`
        .wrap { max-width: 760px; margin: 0 auto; padding: 40px 20px; font-family: "DM Sans", sans-serif; color: #0e2b33; }
        h1 { font-family: "DM Serif Display", serif; font-weight: 400; font-size: 30px; margin-bottom: 24px; }
        h2 { font-family: "DM Serif Display", serif; font-weight: 400; font-size: 20px; margin: 0 0 14px; color: #dd7f41; }
        .panel { background: #f4eee6; border-radius: 12px; padding: 22px; margin-bottom: 20px; }
        label { display: block; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin: 12px 0 5px; color: #5c6b70; }
        input, select { width: 100%; padding: 10px 12px; border: 1px solid #d8cfc0; border-radius: 8px; font-family: inherit; font-size: 14px; background: #fff; box-sizing: border-box; }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        button { margin-top: 16px; background: #0e2b33; color: #fff; border: none; border-radius: 8px; padding: 11px 22px; font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer; }
        button:hover { background: #dd7f41; }
        button.danger { background: transparent; color: #b0442a; padding: 4px 10px; margin: 0; font-size: 12px; border: 1px solid #b0442a; }
        button.danger:hover { background: #b0442a; color: #fff; }
        .msg { font-size: 13px; color: #dd7f41; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #d8cfc0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #5c6b70; }
        td { padding: 8px; border-bottom: 1px solid #e5ddd0; }
        .mono { font-family: monospace; font-weight: 700; }
        tr.expired td { opacity: 0.45; }
        body { background: #fdfbf7; }
      `}</style>
    </div>
  );
}
