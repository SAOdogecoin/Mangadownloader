module.exports = async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  let decoded, hostname;
  try { decoded = decodeURIComponent(url); } catch { decoded = url; }
  try { hostname = new URL(decoded).hostname; } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  const allowed = [
    'uploads.mangadex.org',
    'mangadex.network',
    'cmdxd98umbmalmqdzmbmbkqml.mangadex.network',
    'meo.comick.pictures',
    'meo2.comick.pictures',
  ];
  const isAllowed = allowed.some(d => hostname === d || hostname.endsWith('.' + d))
    || hostname.endsWith('.mangadex.network')
    || hostname.endsWith('.mangadex.org')
    || hostname.endsWith('.comick.pictures');

  if (!isAllowed) {
    return res.status(403).json({ error: `Domain not allowed: ${hostname}` });
  }

  try {
    const r = await fetch(decoded, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://mangadex.org/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    if (!r.ok) throw new Error(`Upstream ${r.status}`);

    const ct = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buf);
  } catch (e) {
    console.error('[proxy]', e.message);
    res.status(502).json({ error: e.message });
  }
};
