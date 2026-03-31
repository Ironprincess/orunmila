// Your private download password — change this to something only you know
const DOWNLOAD_PASSWORD = 'ChicagoBears1985';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Password check via query param
  // Usage: /api/logs?password=yourpassword
  const { password } = req.query;
  if (password !== DOWNLOAD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return res.status(500).json({ error: 'Storage not configured' });
  }

  try {
    // Get all entries from the question_log list
    const response = await fetch(`${url}/lrange/question_log/0/-1`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();
    const entries = (data.result || []).map(item => {
      try { return JSON.parse(decodeURIComponent(item)); }
      catch { return { timestamp: 'unknown', question: item }; }
    });

    // Build CSV
    const rows = entries.map(e =>
      `"${e.timestamp}","${(e.question || '').replace(/"/g, '""')}"`
    ).join('\n');

    const csv = `Timestamp,Question\n${rows}`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition',
      `attachment; filename="orunmila_questions_${new Date().toISOString().split('T')[0]}.csv"`
    );
    return res.status(200).send(csv);

  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve logs' });
  }
}
```

---

## What to Do

**1.** Replace `api/chat.js` with File 1 above

**2.** Create a new file `api/logs.js` with File 2 above

**3.** Change `'rightai2024'` in `api/logs.js` to your own private password

**4.** Commit both files

**5.** Once deployed, you can download your question log anytime by visiting:
```
https://orunmila-nu.vercel.app/api/logs?password=YOURPASSWORD
