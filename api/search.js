const HEADERS = { 'User-Agent': 'Mangaink/1.0 (https://mangaink.vercel.app)' };
const BASE = 'https://api.mangadex.org';
const COMMON = `includes[]=cover_art&availableTranslatedLanguage[]=en&hasAvailableChapters=true&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
const statusMap = { ongoing: 'ongoing', completed: 'completed', hiatus: 'hiatus', cancelled: 'cancelled' };

function mapMangaItem(m, statsMap = {}) {
  const attrs = m.attributes || {};
  const title = attrs.title?.en || Object.values(attrs.title || {})[0] || 'Untitled';
  const rawDesc = attrs.description?.en || Object.values(attrs.description || {})[0] || '';
  const description = rawDesc.replace(/\[.*?\]/g, '').trim().slice(0, 200);
  const coverRel = (m.relationships || []).find(r => r.type === 'cover_art');
  const coverFileName = coverRel?.attributes?.fileName;
  const coverUrl = coverFileName ? `https://uploads.mangadex.org/covers/${m.id}/${coverFileName}.256.jpg` : null;
  const tags = (attrs.tags || []).slice(0, 3).map(t => ({ name: t.attributes?.name?.en || '', id: t.id })).filter(t => t.name);
  const stat = statsMap[m.id];
  const rating = stat?.rating?.bayesian ? Math.round(stat.rating.bayesian * 10) / 10 : null;
  const latestChRel = (m.relationships || []).find(r => r.type === 'chapter');
  const lastChapter = latestChRel?.attributes?.chapter || attrs.lastChapter || null;
  const latestChapterAt = latestChRel?.attributes?.publishAt || null;
  const group = m._chGroup || null;
  return { id: m.id, title, description, coverUrl, status: statusMap[attrs.status] || 'ongoing', year: attrs.year || null, tags, rating, lastChapter, latestChapterAt, group };
}

async function fetchAuthorIds(q) {
  try {
    const r = await fetch(`${BASE}/author?name=${encodeURIComponent(q)}&limit=5`, { headers: HEADERS });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data || []).map(a => a.id);
  } catch { return []; }
}

async function fetchMangaByAuthor(authorId, limit) {
  try {
    const r = await fetch(
      `${BASE}/manga?${COMMON}&authorOrArtist=${authorId}&limit=${limit}&order[followedCount]=desc`,
      { headers: HEADERS }
    );
    if (!r.ok) return [];
    const d = await r.json();
    return d.data || [];
  } catch { return []; }
}

module.exports = async (req, res) => {
  const { q = '', limit = 20, offset = 0, tagId = '', status = '', sort = '', since = '' } = req.query;
  if (!q.trim() && !tagId.trim() && !status.trim() && !sort.trim()) return res.status(400).json({ error: 'Missing query or tagId or status or sort' });

  try {
    // Build title search URL
    let titleUrl = `${BASE}/manga?limit=${limit}&offset=${offset}&${COMMON}`;
    const sortMap = { followedCount:'order[followedCount]=desc', rating:'order[rating]=desc', latestUploadedChapter:'order[latestUploadedChapter]=desc', createdAt:'order[createdAt]=desc' };
    if (q.trim()) {
      titleUrl += `&title=${encodeURIComponent(q)}`;
      if (sort.trim() && sortMap[sort]) {
        titleUrl += '&' + sortMap[sort];
        if (sort === 'latestUploadedChapter') titleUrl += '&includes[]=latest_uploaded_chapter';
      } else {
        titleUrl += '&order[relevance]=desc';
      }
    } else if (sort.trim()) {
      titleUrl += '&' + (sortMap[sort] || sortMap.followedCount);
      if (sort === 'latestUploadedChapter') titleUrl += '&includes[]=latest_uploaded_chapter';
    } else titleUrl += `&order[followedCount]=desc`;
    if (tagId.trim()) titleUrl += `&includedTags[]=${encodeURIComponent(tagId)}`;
    if (status.trim()) titleUrl += `&status[]=${encodeURIComponent(status)}`;
    if (since.trim()) titleUrl += `&createdAtSince=${encodeURIComponent(since)}`;

    // Run title search + author lookup in parallel (author only when q provided)
    const [titleRes, authorIds] = await Promise.all([
      fetch(titleUrl, { headers: HEADERS }),
      q.trim() ? fetchAuthorIds(q) : Promise.resolve([])
    ]);

    if (!titleRes.ok) throw new Error(`MangaDex ${titleRes.status}`);
    const titleData = await titleRes.json();
    const titleItems = titleData.data || [];

    // Fetch manga for found authors (up to 2 authors, 10 results each)
    let authorItems = [];
    if (authorIds.length) {
      const perAuthor = Math.ceil(10 / Math.min(authorIds.length, 2));
      const authorFetches = authorIds.slice(0, 2).map(id => fetchMangaByAuthor(id, perAuthor));
      const authorResults = await Promise.all(authorFetches);
      authorItems = authorResults.flat();
    }

    // Merge and deduplicate (title results first, then author results)
    const seen = new Set();
    const merged = [];
    for (const m of [...titleItems, ...authorItems]) {
      if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
    }

    // Fetch stats + (for latest-updates sort) scanlation groups in parallel
    const ids = merged.map(m => m.id);
    let statsMap = {};

    // For latestUploadedChapter sort, batch-fetch chapters to get scanlation group
    const chIdToManga = {};
    if (sort === 'latestUploadedChapter') {
      merged.forEach(m => {
        const chRel = (m.relationships || []).find(r => r.type === 'chapter');
        if (chRel?.id) chIdToManga[chRel.id] = m;
      });
    }
    const chapterIds = Object.keys(chIdToManga);

    const [statsRes, chapRes] = await Promise.all([
      ids.length ? fetch(`${BASE}/statistics/manga?${ids.map(id => `manga[]=${id}`).join('&')}`, { headers: HEADERS }).catch(() => null) : Promise.resolve(null),
      chapterIds.length ? fetch(`${BASE}/chapter?${chapterIds.map(id => `ids[]=${id}`).join('&')}&includes[]=scanlation_group&limit=100`, { headers: HEADERS }).catch(() => null) : Promise.resolve(null)
    ]);

    try { if (statsRes?.ok) statsMap = (await statsRes.json()).statistics || {}; } catch (_) {}
    try {
      if (chapRes?.ok) {
        const chapData = await chapRes.json();
        (chapData.data || []).forEach(ch => {
          const grp = (ch.relationships || []).find(r => r.type === 'scanlation_group');
          if (grp?.attributes?.name && chIdToManga[ch.id]) chIdToManga[ch.id]._chGroup = grp.attributes.name;
        });
      }
    } catch (_) {}

    const results = merged.map(m => mapMangaItem(m, statsMap));

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json({ results });
  } catch (e) {
    console.error('[search]', e.message);
    res.status(502).json({ error: e.message });
  }
};
