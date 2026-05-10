// ComicK chapter pages — replaces MangaDex at-home + download flow
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://comick.io/',
  'Accept': 'application/json'
};

module.exports = async (req, res) => {
  const { hid } = req.query; // hid = chapter hid from ck-manga chapters
  if (!hid) return res.status(400).json({ error: 'Missing hid' });

  try {
    const r = await fetch(`https://api.comick.fun/chapter/${hid}/get_images`, { headers: HEADERS });
    if (!r.ok) throw new Error(`ComicK pages ${r.status}`);
    const data = await r.json();

    // data is array of { url, w, h, name } or similar
    const pages = (Array.isArray(data) ? data : (data.chapter?.images || [])).map(img => ({
      url: img.url || `https://meo.comick.pictures/${img.b2key || img}`
    }));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.json({ pages });
  } catch (e) {
    console.error('[ck-pages]', e.message);
    res.status(502).json({ error: e.message });
  }
};
