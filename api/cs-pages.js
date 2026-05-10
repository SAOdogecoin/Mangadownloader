// Consumet-backed chapter page reader
const CONSUMET = process.env.CONSUMET_URL || '';
const SOURCE = 'mangakakalot';

module.exports = async (req, res) => {
  if (!CONSUMET) return res.status(503).json({ error: 'CONSUMET_URL not set' });
  const { id } = req.query; // id = chapter id from cs-manga
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const r = await fetch(`${CONSUMET}/manga/${SOURCE}/read?chapterId=${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(`Consumet ${r.status}`);
    const data = await r.json();

    const referer = data.headers?.Referer || 'https://readmanganato.com/';
    const pages = (data.pages || []).map(p => p.img || p.url || p);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.json({ pages, pagesFallback: [], referer, total: pages.length });
  } catch (e) {
    console.error('[cs-pages]', e.message);
    res.status(502).json({ error: e.message });
  }
};
