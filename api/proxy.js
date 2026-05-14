module.exports = async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  let decoded, hostname;
  try { decoded = decodeURIComponent(url); } catch { decoded = url; }
  try { hostname = new URL(decoded).hostname; } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  const allowedExact = [
    'uploads.mangadex.org',
    'mangadex.network',
    'meo.comick.pictures',
    'meo2.comick.pictures',
  ];
  const allowedSuffixes = [
    '.mangadex.network',
    '.mangadex.org',
    '.comick.pictures',
    '.mkklcdnv6temp.com',
    '.mkklcdnv6tempv4.com',
    '.mkklcdnv6tempv5.com',
    '.manganato.com',
    '.readmanganato.com',
    '.chapmanganato.to',
    '.mangakakalot.com',
    'i.imgur.com',
    '.railway.app',      // Suwayomi on Railway
    '.up.railway.app',
  ];

  const isAllowed = allowedExact.some(d => hostname === d || hostname.endsWith('.' + d))
    || allowedSuffixes.some(s => hostname.endsWith(s) || hostname === s.replace(/^\./, ''));

  if (!isAllowed) {
    return res.status(403).json({ error: `Domain not allowed: ${hostname}` });
  }

  // Determine referer: from query param, or infer from hostname
  let ref = referer ? decodeURIComponent(referer) : null;
  if (!ref) {
    if (hostname.includes('mangadex')) ref = 'https://mangadex.org/';
    else if (hostname.includes('manganato') || hostname.includes('mangakakalot') || hostname.includes('mkklcdn')) ref = 'https://readmanganato.com/';
    else if (hostname.includes('comick')) ref = 'https://comick.io/';
    else ref = 'https://mangadex.org/';
  }

  try {
    const r = await fetch(decoded, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': ref,
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
