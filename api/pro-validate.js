// api/pro-validate.js — the gate checks codes here.
const { validateCode, getBody } = require("./_pro");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { code } = getBody(req);
    const result = await validateCode(code);
    if (result.valid) {
      return res.status(200).json({ valid: true, type: result.type, expiresAt: result.expiresAt });
    }
    if (result.expired) {
      return res.status(200).json({ valid: false, expired: true, type: result.type });
    }
    return res.status(200).json({ valid: false, expired: false });
  } catch (e) {
    console.error("validate error", e);
    return res.status(500).json({ error: "Validation failed" });
  }
};
