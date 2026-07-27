module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const DOWNLOAD_PASSWORD = process.env.LOGS_DOWNLOAD_PASSWORD;
  if (!DOWNLOAD_PASSWORD) {
    return res.status(500).json({ error: 'Logs access not configured' });
  }

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
    const response = await fetch(`${url}/lrange/question_log/0/-1`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();
    const entries = (data.result || []).map(item => {
      try { return JSON.parse(decodeURIComponent(item)); }
      catch { return { timestamp: 'unknown', question: item }; }
    });

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
