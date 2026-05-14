// Suwayomi-backed manga search
const SUWAYOMI = process.env.SUWAYOMI_URL || '';
const SOURCE_ID = process.env.SUWAYOMI_SOURCE_ID || '';

module.exports = async (req, res) => {
  if (!SUWAYOMI || !SOURCE_ID) return res.status(503).json({ error: 'SUWAYOMI_URL or SUWAYOMI_SOURCE_ID not set' });
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing q' });

  try {
    const r = await fetch(
      `${SUWAYOMI}/api/v1/source/${SOURCE_ID}/search?searchTerm=${encodeURIComponent(q)}&pageNum=1`
    );
    if (!r.ok) throw new Error(`Suwayomi search ${r.status}`);
    const data = await r.json();

    const results = (data.mangaList || []).map(m => ({
      id: m.url,   // source-relative URL used as ID for sw-manga
      title: m.title || 'Untitled',
      coverUrl: m.thumbnailUrl || null,
      coverReferer: 'https://readmanganato.com/',
      status: (m.status || 'ongoing').toLowerCase(),
      year: null,
      rating: null,
      source: 'alt'
    }));

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json({ results });
  } catch (e) {
    console.error('[sw-search]', e.message);
    res.status(502).json({ error: e.message });
  }
};
