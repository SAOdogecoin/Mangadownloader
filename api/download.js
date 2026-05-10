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

function buildEpub(pageBuffers, mangaTitle, chapterNum) {
  const zip = new JSZip();
  const title = `${mangaTitle} Ch.${chapterNum || '?'}`;
  const uid = `manga-${Date.now()}`;

  // mimetype must be first and uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // container
  zip.folder('META-INF').file('container.xml',
`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:schemas:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const oebps = zip.folder('OEBPS');
  const imgFolder = oebps.folder('images');
  const pageFolder = oebps.folder('pages');

  const valid = [];
  pageBuffers.forEach((p, i) => {
    if (!p.ok) return;
    const ext = p.ct.includes('png') ? 'png' : 'jpg';
    const mt  = p.ct.includes('png') ? 'image/png' : 'image/jpeg';
    const name = `${String(i + 1).padStart(3, '0')}.${ext}`;
    imgFolder.file(name, p.buf);
    valid.push({ num: i + 1, name, mt });
  });

  // page xhtml files
  valid.forEach(({ num, name }) => {
    pageFolder.file(`page-${String(num).padStart(3, '0')}.xhtml`,
`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Page ${num}</title>
<style>html,body{margin:0;padding:0;width:100%;height:100%;background:#000}
img{display:block;width:100%;height:100%;object-fit:contain}</style>
</head>
<body><img src="../images/${name}" alt="Page ${num}"/></body>
</html>`);
  });

  // package.opf
  const manifestItems = valid.map(({ num, name, mt }) =>
    `<item id="img${num}" href="images/${name}" media-type="${mt}"/>
    <item id="page${num}" href="pages/page-${String(num).padStart(3,'0')}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n    ');

  const spineItems = valid.map(({ num }) =>
    `<itemref idref="page${num}"/>`
  ).join('\n    ');

  oebps.file('package.opf',
`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:language>en</dc:language>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:orientation">auto</meta>
    <meta property="rendition:spread">none</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifestItems}
  </manifest>
  <spine page-progression-direction="ltr">
    ${spineItems}
  </spine>
</package>`);

  // nav.xhtml
  const navList = valid.map(({ num }) =>
    `<li><a href="pages/page-${String(num).padStart(3,'0')}.xhtml">Page ${num}</a></li>`
  ).join('\n      ');

  oebps.file('nav.xhtml',
`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${title}</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <ol>${navList}</ol>
  </nav>
</body>
</html>`);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 },
    mimeType: 'application/epub+zip' });
}

module.exports = async (req, res) => {
  const { id, mangaTitle = 'manga', chapterNum = '', format = 'cbz' } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing chapter id' });

  try {
    const atHomeRes = await fetch(`https://api.mangadex.org/at-home/server/${id}`, {
      headers: { 'User-Agent': 'MangaDL/1.0' }
    });
    if (!atHomeRes.ok) throw new Error(`at-home server error: ${atHomeRes.status}`);
    const { baseUrl, chapter } = await atHomeRes.json();

    const safeManga = decodeURIComponent(mangaTitle).replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 60);

    if (format === 'epub') {
      // Use data-saver (JPEG) for Kindle compatibility
      const dataSaver = chapter.dataSaver || chapter.data || [];
      const pageUrls = dataSaver.map(p => `${baseUrl}/data-saver/${chapter.hash}/${p}`);
      if (!pageUrls.length) throw new Error('No pages found');
      const pageBuffers = await fetchBatch(pageUrls, 5);
      const epub = await buildEpub(pageBuffers, decodeURIComponent(mangaTitle), chapterNum);
      const filename = `${safeManga}_Ch${chapterNum || id.slice(0, 8)}.epub`;
      res.setHeader('Content-Type', 'application/epub+zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', epub.length);
      return res.send(epub);
    }

    // Default: CBZ
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
