module.exports = async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const r = await fetch(`https://api.mangadex.org/at-home/server/${id}`, {
      headers: { 'User-Agent': 'MangaDL/1.0' }
    });
    if (!r.ok) throw new Error(`at-home server error: ${r.status}`);
    const data = await r.json();

    const { baseUrl, chapter } = data;
    const pages = (chapter.data || []).map(p => `${baseUrl}/data/${chapter.hash}/${p}`);

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=900');
    res.json({ pages, total: pages.length });
  } catch (e) {
    console.error('[pages]', e.message);
    res.status(502).json({ error: e.message });
  }
};
