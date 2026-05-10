const JSZip = require('jszip');

async function fetchWithRetry(url, retries = 3) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://mangadex.org/',
    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
  };
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers });
      if (r.ok) return r;
      if (r.status === 429 && i < retries) { await new Promise(r => setTimeout(r, 2000 * (i + 1))); continue; }
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function fetchBatch(urls, batchSize = 5) {
  const results = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    const batchResults = await Promise.all(
      urls.slice(i, i + batchSize).map(async url => {
        try {
          const r = await fetchWithRetry(url);
          return { ok: true, buf: Buffer.from(await r.arrayBuffer()), ct: r.headers.get('content-type') || 'image/jpeg' };
        } catch (e) {
          console.error('[download] page failed:', url, e.message);
          return { ok: false };
        }
      })
    );
    results.push(...batchResults);
  }
  return results;
}

module.exports = async (req, res) => {
  const { id, mangaTitle = 'manga', chapterNum = '' } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing chapter id' });

  try {
    const atHomeRes = await fetch(`https://api.mangadex.org/at-home/server/${id}`, {
      headers: { 'User-Agent': 'MangaDL/1.0' }
    });
    if (!atHomeRes.ok) throw new Error(`at-home server error: ${atHomeRes.status}`);
    const { baseUrl, chapter } = await atHomeRes.json();

    const pageUrls = (chapter.data || []).map(p => `${baseUrl}/data/${chapter.hash}/${p}`);
    if (!pageUrls.length) throw new Error('No pages found');

    const pageBuffers = await fetchBatch(pageUrls, 5);

    const zip = new JSZip();
    pageBuffers.forEach((p, i) => {
      if (!p.ok) return;
      const ext = p.ct.includes('png') ? 'png' : p.ct.includes('webp') ? 'webp' : 'jpg';
      zip.file(`${String(i + 1).padStart(3, '0')}.${ext}`, p.buf);
    });

    const cbz = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const safeManga = decodeURIComponent(mangaTitle).replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 60);
    const filename = `${safeManga}_Ch${chapterNum || id.slice(0, 8)}.cbz`;

    res.setHeader('Content-Type', 'application/x-cbz');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', cbz.length);
    res.send(cbz);
  } catch (e) {
    console.error('[download]', e.message);
    res.status(502).json({ error: e.message });
  }
};
