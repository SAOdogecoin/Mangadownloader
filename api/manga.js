module.exports = async (req, res) => {
  const { id, lang = 'en' } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const HEADERS = { 'User-Agent': 'MangaDL/1.0' };

  try {
    const [detailRes, feedRes, statsRes] = await Promise.all([
      fetch(`https://api.mangadex.org/manga/${id}?includes[]=cover_art`, { headers: HEADERS }),
      fetch(`https://api.mangadex.org/manga/${id}/feed?translatedLanguage[]=${lang}&order[volume]=asc&order[chapter]=asc&limit=500&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`, { headers: HEADERS }),
      fetch(`https://api.mangadex.org/statistics/manga/${id}`, { headers: HEADERS })
    ]);

    if (!detailRes.ok) throw new Error(`Manga detail failed: ${detailRes.status}`);
    if (!feedRes.ok) throw new Error(`Chapter feed failed: ${feedRes.status}`);

    const detailData = await detailRes.json();
    const feedData = await feedRes.json();
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

    const chapters = (feedData.data || []).map(ch => {
      const ca = ch.attributes || {};
      return {
        id: ch.id,
        volume: ca.volume || null,
        chapter: ca.chapter || null,
        title: ca.title || null,
        pages: ca.pages || 0,
        publishAt: ca.publishAt || null
      };
    });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.json({ manga, chapters });
  } catch (e) {
    console.error('[manga]', e.message);
    res.status(502).json({ error: e.message });
  }
};
