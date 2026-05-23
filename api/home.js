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

  // Popular-new = manga created in last 6 months, ordered by followers
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 19);

  const [trending, updated, newManga, topRated, recommended, selfPublished, seasonal, popularNew] = await Promise.all([
    fetchSection('order[followedCount]=desc'),
    fetchSection('order[latestUploadedChapter]=desc'),
    fetchSection('order[createdAt]=desc'),
    fetchSection('order[rating]=desc'),
    fetchSection('order[followedCount]=desc&order[rating]=desc&limit=18'),
    fetchSection(`includedTags[]=${TAG_SELF_PUBLISHED}&order[followedCount]=desc`),
    fetchSection(`createdAtSince=${encodeURIComponent(seasonStart)}&order[followedCount]=desc`),
    fetchSection(`createdAtSince=${encodeURIComponent(sixMonthsAgo)}&order[followedCount]=desc`),
  ]);

  // Fetch stats for all unique ids
  const allItems = [...trending, ...updated, ...newManga, ...topRated, ...recommended, ...selfPublished, ...seasonal, ...popularNew];
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

  function mapManga(m, includeExtra) {
    const attrs = m.attributes || {};
    const title = attrs.title?.en || Object.values(attrs.title || {})[0] || 'Untitled';
    const coverRel = (m.relationships || []).find(r => r.type === 'cover_art');
    const coverFileName = coverRel?.attributes?.fileName;
    const coverUrl = coverFileName ? `https://uploads.mangadex.org/covers/${m.id}/${coverFileName}.256.jpg` : null;
    const stat = statsMap[m.id];
    const rating = stat?.rating?.bayesian ? Math.round(stat.rating.bayesian * 10) / 10 : null;
    const lastChapter = attrs.lastChapter || null;
    const base = { id: m.id, title, coverUrl, status: attrs.status || 'ongoing', year: attrs.year || null, rating, lastChapter };
    if (includeExtra) {
      const rawDesc = attrs.description?.en || Object.values(attrs.description || {})[0] || '';
      base.description = rawDesc.replace(/\[.*?\]/g, '').trim();
      base.tags = (attrs.tags || []).slice(0, 3).map(t => ({ name: t.attributes?.name?.en || '', id: t.id })).filter(t => t.name);
    }
    return base;
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
    popularNew: popularNew.map(m => mapManga(m, true)), // hero needs description+tags
    seasonName: `${season.name} ${season.year}`,
  });
};
