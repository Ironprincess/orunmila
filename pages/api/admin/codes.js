// pages/api/admin/codes.js — code management for you and the VA.
// Protected by the ORUNMILA_ADMIN_SECRET env var, sent as the x-admin-secret
// header. Same pattern as your private CSV endpoint.

import { createCode, listCodes, revokeCode } from "../../../lib/access";

export default async function handler(req, res) {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.ORUNMILA_ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json({ codes: await listCodes() });
    }

    if (req.method === "POST") {
      const { code, type, days, expiresAt, label } = req.body || {};
      if (!["monthly", "annual", "cohort"].includes(type)) {
        return res.status(400).json({ error: "type must be monthly, annual, or cohort" });
      }
      const created = await createCode({ code, type, days, expiresAt, label });
      return res.status(200).json({ created });
    }

    if (req.method === "DELETE") {
      const { code } = req.body || {};
      if (!code) return res.status(400).json({ error: "code required" });
      return res.status(200).json(await revokeCode(code));
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("admin codes error", e);
    return res.status(500).json({ error: "Admin operation failed" });
  }
}
