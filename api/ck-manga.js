const BASE = 'https://api.comick.fun';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://comick.io/',
  'Accept': 'application/json'
};

const statusMap = { 1: 'ongoing', 2: 'completed', 3: 'cancelled', 4: 'hiatus' };

module.exports = async (req, res) => {
  const { id } = req.query; // id = slug
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const [detailRes, chaptersRes] = await Promise.all([
      fetch(`${BASE}/comic/${id}`, { headers: HEADERS }),
      fetch(`${BASE}/comic/${id}/chapters?lang=en&limit=500&page=1`, { headers: HEADERS })
    ]);

    if (!detailRes.ok) throw new Error(`Detail failed: ${detailRes.status}`);
    const detailData = await detailRes.json();
    const c = detailData.comic || detailData;

    const cover = detailData.md_covers?.[0] || c.cover || null;
    const coverUrl = cover?.b2key
      ? `https://meo.comick.pictures/${cover.b2key}`
      : cover?.gpurl || null;

    const tags = (detailData.md_comic_md_genres || c.genres || [])
      .map(g => ({ name: g.md_genres?.name || g.name || String(g), id: String(g.md_genres?.id || g.id || g) }))
      .filter(t => t.name);

    const rating = c.bayesian_rating ? Math.round(parseFloat(c.bayesian_rating) * 10) / 10 : null;

    const manga = {
      id: c.slug || id,
      title: c.title || 'Untitled',
      description: (c.desc || '').replace(/\[.*?\]/g, '').trim(),
      coverUrl,
      status: statusMap[c.status] || 'ongoing',
      year: c.year || null,
      tags,
      originalLanguage: c.country || 'jp',
      rating,
      follows: c.follow_count || null
    };

    let chapters = [];
    if (chaptersRes.ok) {
      const chapData = await chaptersRes.json();
      const rawChs = chapData.chapters || chapData || [];
      chapters = rawChs.map(ch => ({
        id: ch.hid,
        volume: ch.vol ? String(ch.vol) : null,
        chapter: ch.chap ? String(ch.chap) : null,
        title: ch.title || null,
        pages: ch.page_count || 0,
        publishAt: ch.created_at || null
      }));
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.json({ manga, chapters });
  } catch (e) {
    console.error('[ck-manga]', e.message);
    res.status(502).json({ error: e.message });
  }
};
