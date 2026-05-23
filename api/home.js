const HEADERS = { 'User-Agent': 'Mangaink/1.0 (https://mangaink.vercel.app)' };
const BASE = 'https://api.mangadex.org';
const COMMON = `includes[]=cover_art&availableTranslatedLanguage[]=en&hasAvailableChapters=true&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&limit=18`;

// MangaDex tag IDs
const TAG_SELF_PUBLISHED = '891cf039-b895-47f0-9229-bef4c96eccd4';

async function fetchSection(extra) {
  try {
    const r = await fetch(`${BASE}/manga?${COMMON}&${extra}`, { headers: HEADERS });
    if (!r.ok) return [];
    const d = await r.json();
    return d.data || [];
  } catch { return []; }
}

// Determine current season-year for seasonal section
function currentSeason() {
  const now = new Date();
  const m = now.getUTCMonth() + 1; // 1-12
  const y = now.getUTCFullYear();
  if (m >= 3 && m <= 5) return { name: 'Spring', year: y };
  if (m >= 6 && m <= 8) return { name: 'Summer', year: y };
  if (m >= 9 && m <= 11) return { name: 'Fall', year: y };
  return { name: 'Winter', year: y };
}

module.exports = async (req, res) => {
  const season = currentSeason();
  const seasonStart =
    season.name === 'Spring' ? `${season.year}-03-01T00:00:00` :
    season.name === 'Summer' ? `${season.year}-06-01T00:00:00` :
    season.name === 'Fall'   ? `${season.year}-09-01T00:00:00` :
                               `${season.year}-12-01T00:00:00`;

  const [trending, updated, newManga, topRated, recommended, selfPublished, seasonal] = await Promise.all([
    fetchSection('order[followedCount]=desc'),
    fetchSection('order[latestUploadedChapter]=desc'),
    fetchSection('order[createdAt]=desc'),
    fetchSection('order[rating]=desc'),
    // Recommended = highly-followed + decent rating mix
    fetchSection('order[followedCount]=desc&order[rating]=desc&limit=18'),
    // Self-Published tag filter
    fetchSection(`includedTags[]=${TAG_SELF_PUBLISHED}&order[followedCount]=desc`),
    // Seasonal = created since season start, ongoing
    fetchSection(`createdAtSince=${encodeURIComponent(seasonStart)}&order[followedCount]=desc`),
  ]);

  // Fetch stats for all unique ids
  const allItems = [...trending, ...updated, ...newManga, ...topRated, ...recommended, ...selfPublished, ...seasonal];
  const ids = [...new Set(allItems.map(m => m.id))];
  let statsMap = {};
  try {
    if (ids.length) {
      // MangaDex statistics endpoint accepts up to ~100 ids; we may have ~120, split if needed
      const chunks = [];
      for (let i = 0; i < ids.length; i += 90) chunks.push(ids.slice(i, i + 90));
      const stats = await Promise.all(chunks.map(c =>
        fetch(`${BASE}/statistics/manga?${c.map(id => `manga[]=${id}`).join('&')}`, { headers: HEADERS })
          .then(r => r.ok ? r.json() : null).catch(() => null)
      ));
      stats.forEach(s => { if (s?.statistics) Object.assign(statsMap, s.statistics); });
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

  // Dedupe recommended/seasonal vs trending (already-shown manga)
  const trendingIds = new Set(trending.map(m => m.id));
  const recommendedDedup = recommended.filter(m => !trendingIds.has(m.id));

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.json({
    trending: trending.map(mapManga),
    updated: updated.map(mapManga),
    newManga: newManga.map(mapManga),
    topRated: topRated.map(mapManga),
    recommended: recommendedDedup.map(mapManga),
    selfPublished: selfPublished.map(mapManga),
    seasonal: seasonal.map(mapManga),
    seasonName: `${season.name} ${season.year}`,
  });
};
