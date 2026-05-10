const HEADERS = { 'User-Agent': 'MangaDL/1.0 (https://manga-dl-app.vercel.app)' };
const BASE = 'https://api.mangadex.org';
const COMMON = `includes[]=cover_art&availableTranslatedLanguage[]=en&hasAvailableChapters=true&contentRating[]=safe&contentRating[]=suggestive&limit=18`;

async function fetchSection(order) {
  try {
    const r = await fetch(`${BASE}/manga?${COMMON}&${order}`, { headers: HEADERS });
    if (!r.ok) return [];
    const d = await r.json();
    return d.data || [];
  } catch { return []; }
}

module.exports = async (req, res) => {
  const [trending, updated, newManga, topRated] = await Promise.all([
    fetchSection('order[followedCount]=desc'),
    fetchSection('order[latestUploadedChapter]=desc'),
    fetchSection('order[createdAt]=desc'),
    fetchSection('order[rating]=desc'),
  ]);

  // Fetch stats for all unique ids
  const allItems = [...trending, ...updated, ...newManga, ...topRated];
  const ids = [...new Set(allItems.map(m => m.id))];
  let statsMap = {};
  try {
    if (ids.length) {
      const statsRes = await fetch(`${BASE}/statistics/manga?${ids.map(id => `manga[]=${id}`).join('&')}`, { headers: HEADERS });
      if (statsRes.ok) statsMap = (await statsRes.json()).statistics || {};
    }
  } catch {}

  function mapManga(m) {
    const attrs = m.attributes || {};
    const title = attrs.title?.en || Object.values(attrs.title || {})[0] || 'Untitled';
    const coverRel = (m.relationships || []).find(r => r.type === 'cover_art');
    const coverFileName = coverRel?.attributes?.fileName;
    const coverUrl = coverFileName ? `https://uploads.mangadex.org/covers/${m.id}/${coverFileName}.256.jpg` : null;
    const stat = statsMap[m.id];
    const rating = stat?.rating?.bayesian ? Math.round(stat.rating.bayesian * 10) / 10 : null;
    const lastChapter = attrs.lastChapter || null;
    return { id: m.id, title, coverUrl, status: attrs.status || 'ongoing', year: attrs.year || null, rating, lastChapter };
  }

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.json({
    trending: trending.map(mapManga),
    updated: updated.map(mapManga),
    newManga: newManga.map(mapManga),
    topRated: topRated.map(mapManga),
  });
};
