// Consumet-backed search (MangaKakalot source)
const CONSUMET = process.env.CONSUMET_URL || '';
const SOURCE = 'mangakakalot';

const statusMap = s => {
  if (!s) return 'ongoing';
  const l = s.toLowerCase();
  if (l.includes('complet')) return 'completed';
  if (l.includes('hiatus')) return 'hiatus';
  if (l.includes('cancel') || l.includes('discontinu')) return 'cancelled';
  return 'ongoing';
};

module.exports = async (req, res) => {
  if (!CONSUMET) return res.status(503).json({ error: 'CONSUMET_URL not set' });
  const { q = '', limit = 20, offset = 0, status = '' } = req.query;
  if (!q.trim() && !status.trim()) return res.status(400).json({ error: 'Missing query' });

  try {
    const page = Math.floor(offset / limit) + 1;
    const url = `${CONSUMET}/manga/${SOURCE}/${encodeURIComponent(q || 'manga')}?page=${page}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Consumet ${r.status}`);
    const data = await r.json();
    const items = data.results || [];

    const results = items.slice(0, limit).map(m => ({
      id: m.id,
      title: m.title || 'Untitled',
      description: m.description || '',
      coverUrl: m.image || null,
      coverReferer: m.headerForImage?.Referer || 'https://readmanganato.com/',
      status: statusMap(m.status),
      year: null,
      tags: (m.genres || []).slice(0, 3).map(g => ({ name: g, id: g })),
      rating: m.rating ? Math.round(parseFloat(m.rating) * 10) / 10 : null,
      lastChapter: null
    }));

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json({ results });
  } catch (e) {
    console.error('[cs-search]', e.message);
    res.status(502).json({ error: e.message });
  }
};
