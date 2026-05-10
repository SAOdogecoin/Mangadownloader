const BASE = 'https://api.comick.fun';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://comick.io/',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9'
};

const statusMap = { 1: 'ongoing', 2: 'completed', 3: 'cancelled', 4: 'hiatus' };

function mapManga(m) {
  const cover = m.md_covers?.[0] || m.cover || null;
  const coverUrl = cover?.b2key
    ? `https://meo.comick.pictures/${cover.b2key}`
    : cover?.gpurl || null;
  const tags = (m.genres || []).slice(0, 3).map(g => ({ name: g.name || g, id: String(g.id || g) }));
  const rating = m.bayesian_rating ? Math.round(parseFloat(m.bayesian_rating) * 10) / 10 : null;
  return {
    id: m.slug || String(m.id),
    title: m.title || 'Untitled',
    description: (m.desc || '').replace(/\[.*?\]/g, '').trim().slice(0, 200),
    coverUrl,
    status: statusMap[m.status] || 'ongoing',
    year: m.year || null,
    tags,
    rating,
    lastChapter: m.last_chapter ? String(m.last_chapter) : null
  };
}

module.exports = async (req, res) => {
  const { q = '', limit = 20, offset = 0, status = '' } = req.query;
  if (!q.trim() && !status.trim()) return res.status(400).json({ error: 'Missing query or status' });

  try {
    let url = `${BASE}/v1.0/search?type=comic&limit=${limit}&page=${Math.floor(offset / limit) + 1}&lang=en`;
    if (q.trim()) url += `&q=${encodeURIComponent(q)}`;
    if (status.trim()) {
      const statusNum = { ongoing: 1, completed: 2, cancelled: 3, hiatus: 4 }[status] || 1;
      url += `&status=${statusNum}`;
    }

    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) throw new Error(`ComicK ${r.status}: ${await r.text().then(t => t.slice(0, 100))}`);
    const data = await r.json();
    const items = Array.isArray(data) ? data : (data.data || []);

    const results = items.map(mapManga);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json({ results });
  } catch (e) {
    console.error('[ck-search]', e.message);
    res.status(502).json({ error: e.message });
  }
};
