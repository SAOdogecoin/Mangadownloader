// Suwayomi-backed home — single source by default for fast load
const SUWAYOMI = process.env.SUWAYOMI_URL || '';
const SOURCE_IDS = (process.env.SUWAYOMI_SOURCE_IDS || process.env.SUWAYOMI_SOURCE_ID || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function mapItem(m, srcIdx) {
  const thumb = m.thumbnailUrl
    ? (m.thumbnailUrl.startsWith('http') ? m.thumbnailUrl : `${SUWAYOMI}${m.thumbnailUrl}`)
    : null;
  return {
    id: String(m.id),
    title: m.title || 'Untitled',
    coverUrl: thumb,
    coverReferer: null,
    status: (m.status || 'ongoing').toLowerCase(),
    year: null,
    rating: null,
    lastChapter: null,
    sourceIdx: srcIdx,
    source: 'alt'
  };
}

async function fetchSection(url, srcIdx) {
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const text = await r.text();
    if (!text.startsWith('{')) return [];
    const d = JSON.parse(text);
    return (d.mangaList || []).map(m => mapItem(m, srcIdx));
  } catch { return []; }
}

module.exports = async (req, res) => {
  if (!SUWAYOMI || !SOURCE_IDS.length) return res.status(503).json({ error: 'SUWAYOMI_URL or SUWAYOMI_SOURCE_ID(S) not set' });

  const srcIdx = Math.max(0, Math.min(parseInt(req.query.srcIdx || '0', 10), SOURCE_IDS.length - 1));
  const sourceId = SOURCE_IDS[srcIdx];

  const base = `${SUWAYOMI}/api/v1/source/${sourceId}`;
  const [popular, latest] = await Promise.all([
    fetchSection(`${base}/popular/1`, srcIdx),
    fetchSection(`${base}/latest/1`, srcIdx)
  ]);

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600, max-age=600');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=3600');
  res.json({
    trending: popular.slice(0, 12),
    updated: latest.slice(0, 12),
    newManga: popular.slice(12, 24),
    topRated: latest.slice(12, 24),
    sourceIdx,
    totalSources: SOURCE_IDS.length,
    hasMore: srcIdx < SOURCE_IDS.length - 1
  });
};
