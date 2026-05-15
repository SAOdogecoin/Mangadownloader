// MangaPlus (Shueisha official) — fallback for popular Shueisha titles
// Public API at jumpg-webapi.tokyo-cdn.com, no auth needed.
// Uses protobuf for some responses — we use the JSON-supporting endpoints where possible.
const MP_BASE = 'https://jumpg-webapi.tokyo-cdn.com/api';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json,application/octet-stream',
  'Origin': 'https://mangaplus.shueisha.co.jp',
  'Referer': 'https://mangaplus.shueisha.co.jp/'
};

async function actionSearch(q) {
  // MangaPlus has no public search; fetch all titles and filter client-side
  const r = await fetch(`${MP_BASE}/title_list/allV2`, { headers: HEADERS });
  if (!r.ok) throw new Error(`MangaPlus list ${r.status}`);
  // Note: this endpoint returns protobuf. Without protobuf decoder we can't easily parse.
  // Falling back to web-public JSON endpoint instead:
  const r2 = await fetch(`https://mangaplus.shueisha.co.jp/api/title_list/all`, { headers: HEADERS });
  if (!r2.ok) throw new Error(`MangaPlus json list ${r2.status}`);
  const text = await r2.text();
  // The response may not be JSON. Skip if not.
  if (!text.startsWith('{') && !text.startsWith('[')) throw new Error('MangaPlus search not available');
  const data = JSON.parse(text);
  const allTitles = data.success?.allTitlesView?.AllTitlesGroup || [];
  const ql = q.toLowerCase();
  const matches = [];
  for (const group of allTitles) {
    for (const t of (group.titles || [])) {
      if ((t.name || '').toLowerCase().includes(ql) || (t.author || '').toLowerCase().includes(ql)) {
        matches.push({
          id: `mp:${t.titleId}`,
          title: t.name || 'Untitled',
          coverUrl: t.portraitImageUrl || null,
          coverReferer: 'https://mangaplus.shueisha.co.jp/',
          status: 'ongoing',
          year: null,
          rating: null,
          tags: [],
          lastChapter: null,
          source: 'mp'
        });
      }
    }
  }
  return { results: matches.slice(0, 24) };
}

async function actionManga(rawId) {
  const titleId = rawId.replace(/^mp:/, '');
  const r = await fetch(`${MP_BASE}/title_detailV3?title_id=${titleId}&format=json`, { headers: HEADERS });
  if (!r.ok) throw new Error(`MangaPlus title ${r.status}`);
  const data = await r.json();
  const detail = data.success?.titleDetailView;
  if (!detail) throw new Error('Title detail not found');
  const t = detail.title || {};
  const manga = {
    id: `mp:${titleId}`,
    title: t.name || 'Untitled',
    description: (detail.overview || '').replace(/\[.*?\]/g, '').trim(),
    coverUrl: t.portraitImageUrl || null,
    coverReferer: 'https://mangaplus.shueisha.co.jp/',
    status: (detail.titleLabels?.releaseSchedule || 'ongoing').toLowerCase().includes('compl') ? 'completed' : 'ongoing',
    year: null,
    tags: [{ name: 'Shueisha', id: 'shueisha' }],
    originalLanguage: 'ja',
    rating: null,
    follows: null,
    source: 'mp'
  };
  const allChapters = [...(detail.firstChapterList || []), ...(detail.lastChapterList || [])];
  const seen = new Set();
  const chapters = allChapters
    .filter(c => { if (seen.has(c.chapterId)) return false; seen.add(c.chapterId); return true; })
    .map(c => ({
      id: `mp:${c.chapterId}`,
      volume: null,
      chapter: c.name?.replace(/^#?ch\.?\s*/i, '') || c.subTitle || '?',
      title: c.subTitle || null,
      pages: 0,
      publishAt: c.startTimeStamp ? new Date(c.startTimeStamp * 1000).toISOString() : null
    }));
  return { manga, chapters };
}

async function actionPages(rawId) {
  const chapterId = rawId.replace(/^mp:/, '');
  // MangaPlus uses image_quality high|low, and split=no for double-page rendering
  const r = await fetch(`${MP_BASE}/manga_viewer?chapter_id=${chapterId}&split=no&img_quality=super_high&format=json`, { headers: HEADERS });
  if (!r.ok) throw new Error(`MangaPlus pages ${r.status}`);
  const data = await r.json();
  const viewer = data.success?.mangaViewer;
  if (!viewer) throw new Error('Viewer data missing');
  const pages = (viewer.pages || [])
    .map(p => p.mangaPage?.imageUrl)
    .filter(Boolean);
  if (!pages.length) throw new Error('No pages found');
  return { pages, pagesFallback: [], total: pages.length };
}

module.exports = async (req, res) => {
  const { action, q, id } = req.query;
  try {
    let out;
    if (action === 'search') {
      if (!q) return res.status(400).json({ error: 'Missing q' });
      out = await actionSearch(q);
    }
    else if (action === 'manga') {
      if (!id) return res.status(400).json({ error: 'Missing id' });
      out = await actionManga(id);
    }
    else if (action === 'pages') {
      if (!id) return res.status(400).json({ error: 'Missing id' });
      out = await actionPages(id);
    }
    else return res.status(400).json({ error: 'Invalid action' });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.json(out);
  } catch (e) {
    console.error('[mangaplus]', action, e.message);
    res.status(502).json({ error: e.message });
  }
};
