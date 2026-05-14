// Suwayomi-backed home sections (popular + latest from configured source)
const SUWAYOMI = process.env.SUWAYOMI_URL || '';
const SOURCE_ID = process.env.SUWAYOMI_SOURCE_ID || '';

function mapItem(m) {
  return {
    id: String(m.id),
    title: m.title || 'Untitled',
    coverUrl: m.thumbnailUrl || null,
    coverReferer: null,
    status: (m.status || 'ongoing').toLowerCase(),
    year: null,
    rating: null,
    lastChapter: null,
    source: 'alt'
  };
}

async function fetchSection(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.mangaList || []).slice(0, 18).map(mapItem);
  } catch { return []; }
}

module.exports = async (req, res) => {
  if (!SUWAYOMI || !SOURCE_ID) return res.status(503).json({ error: 'SUWAYOMI_URL or SUWAYOMI_SOURCE_ID not set' });

  const base = `${SUWAYOMI}/api/v1/source/${SOURCE_ID}`;
  const [popular, latest] = await Promise.all([
    fetchSection(`${base}/popular?pageNum=1`),
    fetchSection(`${base}/latest?pageNum=1`)
  ]);

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.json({
    trending: popular,
    updated: latest,
    newManga: [],
    topRated: []
  });
};
