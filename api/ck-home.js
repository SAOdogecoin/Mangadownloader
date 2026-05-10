const BASE = 'https://api.comick.fun';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://comick.io/',
  'Accept': 'application/json'
};

const statusMap = { 1: 'ongoing', 2: 'completed', 3: 'cancelled', 4: 'hiatus' };

function mapManga(m) {
  const cover = m.md_covers?.[0] || m.cover || null;
  const coverUrl = cover?.b2key
    ? `https://meo.comick.pictures/${cover.b2key}`
    : cover?.gpurl || null;
  const rating = m.bayesian_rating ? Math.round(parseFloat(m.bayesian_rating) * 10) / 10 : null;
  return {
    id: m.slug || String(m.id),
    title: m.title || 'Untitled',
    coverUrl,
    status: statusMap[m.status] || 'ongoing',
    year: m.year || null,
    rating,
    lastChapter: m.last_chapter ? String(m.last_chapter) : null
  };
}

async function fetchSection(sort, limit = 18) {
  try {
    const r = await fetch(
      `${BASE}/v1.0/search?type=comic&sort=${sort}&limit=${limit}&lang=en`,
      { headers: HEADERS }
    );
    if (!r.ok) return [];
    const d = await r.json();
    return (Array.isArray(d) ? d : (d.data || []));
  } catch { return []; }
}

module.exports = async (req, res) => {
  const [trending, updated, newManga, topRated] = await Promise.all([
    fetchSection('follow', 18),
    fetchSection('uploaded', 18),
    fetchSection('created_at', 18),
    fetchSection('rating', 18)
  ]);

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.json({
    trending: trending.map(mapManga),
    updated: updated.map(mapManga),
    newManga: newManga.map(mapManga),
    topRated: topRated.map(mapManga)
  });
};
