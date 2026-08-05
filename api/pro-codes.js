// api/pro-codes.js — code management for you and the VA.
// Protected by ORUNMILA_ADMIN_SECRET, sent as the x-admin-secret header.
const { createCode, listCodes, revokeCode, getBody } = require("./_pro");

module.exports = async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.ORUNMILA_ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    if (req.method === "GET") {
      return res.status(200).json({ codes: await listCodes() });
    }
    if (req.method === "POST") {
      const { code, type, days, label } = getBody(req);
      if (!["monthly", "annual", "cohort"].includes(type)) {
        return res.status(400).json({ error: "type must be monthly, annual, or cohort" });
      }
      const created = await createCode({ code, type, days, label });
      return res.status(200).json({ created });
    }
    if (req.method === "DELETE") {
      const { code } = getBody(req);
      if (!code) return res.status(400).json({ error: "code required" });
      return res.status(200).json(await revokeCode(code));
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("admin codes error", e);
    return res.status(500).json({ error: "Admin operation failed" });
  }
};
