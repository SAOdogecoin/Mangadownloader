module.exports = async (req, res) => {
  const { q = '', limit = 20, offset = 0, tagId = '', status = '' } = req.query;
  if (!q.trim() && !tagId.trim() && !status.trim()) return res.status(400).json({ error: 'Missing query or tagId or status' });

  const HEADERS = { 'User-Agent': 'MangaDL/1.0 (https://manga-dl-app.vercel.app)' };
  const statusMap = { ongoing: 'ongoing', completed: 'completed', hiatus: 'hiatus', cancelled: 'cancelled' };

  try {
    let url = `https://api.mangadex.org/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&availableTranslatedLanguage[]=en&hasAvailableChapters=true&contentRating[]=safe&contentRating[]=suggestive`;
    if (q.trim()) url += `&title=${encodeURIComponent(q)}&order[relevance]=desc`;
    else url += `&order[followedCount]=desc`;
    if (tagId.trim()) url += `&includedTags[]=${encodeURIComponent(tagId)}`;
    if (status.trim()) url += `&status[]=${encodeURIComponent(status)}`;

    const mangaRes = await fetch(url, { headers: HEADERS });
    if (!mangaRes.ok) throw new Error(`MangaDex ${mangaRes.status}`);
    const data = await mangaRes.json();

    const ids = (data.data || []).map(m => m.id);

    let statsMap = {};
    if (ids.length) {
      try {
        const statsRes = await fetch(
          `https://api.mangadex.org/statistics/manga?${ids.map(id => `manga[]=${id}`).join('&')}`,
          { headers: HEADERS }
        );
        if (statsRes.ok) statsMap = (await statsRes.json()).statistics || {};
      } catch (_) {}
    }

    const results = (data.data || []).map(m => {
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
      const lastChapter = attrs.lastChapter || null;
      return { id: m.id, title, description, coverUrl, status: statusMap[attrs.status] || 'ongoing', year: attrs.year || null, tags, rating, lastChapter };
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json({ results });
  } catch (e) {
    console.error('[search]', e.message);
    res.status(502).json({ error: e.message });
  }
};
