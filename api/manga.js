const HEADERS = { 'User-Agent': 'MangaDL/1.0' };
const BASE = 'https://api.mangadex.org';
const FEED_PARAMS = `contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic&includes[]=scanlation_group`;

async function fetchAllChapters(id, lang) {
  const limit = 500;
  let offset = 0;
  let all = [];

  // First fetch — also tells us total count
  const firstRes = await fetch(
    `${BASE}/manga/${id}/feed?order[volume]=asc&order[chapter]=asc&limit=${limit}&offset=0&${FEED_PARAMS}`,
    { headers: HEADERS }
  );
  if (!firstRes.ok) throw new Error(`Chapter feed failed: ${firstRes.status}`);
  const firstData = await firstRes.json();
  all.push(...(firstData.data || []));

  const total = firstData.total || 0;

  // Paginate remaining pages in parallel (batches of 3 to avoid rate limit)
  if (total > limit) {
    const offsets = [];
    for (let o = limit; o < total; o += limit) offsets.push(o);

    // Fetch in batches of 3
    for (let i = 0; i < offsets.length; i += 3) {
      const batch = offsets.slice(i, i + 3).map(o =>
        fetch(
          `${BASE}/manga/${id}/feed?order[volume]=asc&order[chapter]=asc&limit=${limit}&offset=${o}&${FEED_PARAMS}`,
          { headers: HEADERS }
        ).then(r => r.ok ? r.json() : { data: [] }).then(d => d.data || [])
        .catch(() => [])
      );
      const results = await Promise.all(batch);
      results.forEach(r => all.push(...r));
      if (i + 3 < offsets.length) await new Promise(r => setTimeout(r, 300));
    }
  }

  return all;
}

module.exports = async (req, res) => {
  const { id, lang = 'en' } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const [detailRes, statsRes, allChapterData] = await Promise.all([
      fetch(`${BASE}/manga/${id}?includes[]=cover_art`, { headers: HEADERS }),
      fetch(`${BASE}/statistics/manga/${id}`, { headers: HEADERS }),
      fetchAllChapters(id, lang)
    ]);

    if (!detailRes.ok) throw new Error(`Manga detail failed: ${detailRes.status}`);

    const detailData = await detailRes.json();
    let statsData = null;
    try { if (statsRes.ok) statsData = await statsRes.json(); } catch (_) {}

    const m = detailData.data;
    const attrs = m.attributes || {};
    const title = attrs.title?.en || Object.values(attrs.title || {})[0] || 'Untitled';
    const rawDesc = attrs.description?.en || Object.values(attrs.description || {})[0] || '';

    const coverRel = (m.relationships || []).find(r => r.type === 'cover_art');
    const coverFileName = coverRel?.attributes?.fileName;
    const coverUrl = coverFileName
      ? `https://uploads.mangadex.org/covers/${m.id}/${coverFileName}.512.jpg`
      : null;

    const tags = (attrs.tags || []).map(t => ({ name: t.attributes?.name?.en || '', id: t.id })).filter(t => t.name);

    const manga = {
      id: m.id,
      title,
      description: rawDesc.replace(/\[.*?\]/g, '').trim(),
      coverUrl,
      status: attrs.status || 'unknown',
      year: attrs.year || null,
      tags,
      originalLanguage: attrs.originalLanguage || 'ja',
      rating: statsData?.statistics?.[m.id]?.rating?.bayesian
        ? Math.round(statsData.statistics[m.id].rating.bayesian * 10) / 10
        : null,
      follows: statsData?.statistics?.[m.id]?.follows || null
    };

    // Map all raw chapters with group info
    const mapped = allChapterData.map(ch => {
      const ca = ch.attributes || {};
      const groupRel = (ch.relationships || []).find(r => r.type === 'scanlation_group');
      return {
        id: ch.id,
        volume: ca.volume || null,
        chapter: ca.chapter || null,
        title: ca.title || null,
        pages: ca.pages || 0,
        publishAt: ca.publishAt || null,
        group: groupRel?.attributes?.name || null,
        translatedLanguage: ca.translatedLanguage || lang,
        externalUrl: ca.externalUrl || null
      };
    });

    // Group by volume+chapter key — primary = first seen, sources = all
    const chapterMap = new Map();
    for (const ch of mapped) {
      const key = `${ch.volume || ''}-${ch.chapter || ch.id}`;
      if (!chapterMap.has(key)) {
        chapterMap.set(key, { ...ch, sources: [] });
      }
      chapterMap.get(key).sources.push({
        id: ch.id,
        group: ch.group,
        publishAt: ch.publishAt,
        pages: ch.pages,
        translatedLanguage: ch.translatedLanguage,
        externalUrl: ch.externalUrl
      });
    }

    const chapters = [...chapterMap.values()];

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.json({ manga, chapters });
  } catch (e) {
    console.error('[manga]', e.message);
    res.status(502).json({ error: e.message });
  }
};
