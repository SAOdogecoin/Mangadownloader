const HEADERS = { 'User-Agent': 'MangaDL/1.0' };

async function getAtHome(id, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(`https://api.mangadex.org/at-home/server/${id}`, { headers: HEADERS });
      if (r.ok) return await r.json();
      if (r.status === 429 && i < retries) { await new Promise(r => setTimeout(r, 2000 * (i + 1))); continue; }
      throw new Error(`at-home ${r.status}`);
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

module.exports = async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const data = await getAtHome(id);
    const { baseUrl, chapter } = data;

    // Primary (high quality) + fallback (data-saver, smaller JPEG)
    const pages = (chapter.data || []).map(p => `${baseUrl}/data/${chapter.hash}/${p}`);
    const pagesFallback = (chapter.dataSaver || chapter.data || []).map(p => `${baseUrl}/data-saver/${chapter.hash}/${p}`);

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=900');
    res.json({ pages, pagesFallback, total: pages.length });
  } catch (e) {
    console.error('[pages]', e.message);
    res.status(502).json({ error: e.message });
  }
};
