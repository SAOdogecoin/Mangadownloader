// Suwayomi-backed search — single source by default, cascadable via srcIdx
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
    tags: [],
    lastChapter: null,
    sourceIdx: srcIdx,
    source: 'alt'
  };
}

async function searchOne(sourceId, q, srcIdx) {
  try {
    const r = await fetch(`${SUWAYOMI}/api/v1/source/${sourceId}/search?searchTerm=${encodeURIComponent(q)}&pageNum=1`);
    if (!r.ok) return [];
    const text = await r.text();
    if (!text.startsWith('{')) return [];
    const data = JSON.parse(text);
    return (data.mangaList || []).map(m => mapItem(m, srcIdx));
  } catch { return []; }
}

async function getSourceName(sourceId) {
  try {
    const r = await fetch(`${SUWAYOMI}/api/v1/source/${sourceId}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.name || d.displayName || null;
  } catch { return null; }
}

module.exports = async (req, res) => {
  if (!SUWAYOMI || !SOURCE_IDS.length) return res.status(503).json({ error: 'SUWAYOMI_URL or SUWAYOMI_SOURCE_ID(S) not set' });
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing q' });

  const srcIdx = Math.max(0, Math.min(parseInt(req.query.srcIdx || '0', 10), SOURCE_IDS.length - 1));
  const sourceId = SOURCE_IDS[srcIdx];

  try {
    const [results, sourceName] = await Promise.all([
      searchOne(sourceId, q, srcIdx),
      getSourceName(sourceId)
    ]);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json({
      results,
      sourceName: sourceName || `Source ${srcIdx + 1}`,
      sourceIdx: srcIdx,
      totalSources: SOURCE_IDS.length,
      hasMore: srcIdx < SOURCE_IDS.length - 1
    });
  } catch (e) {
    console.error('[sw-search]', e.message);
    res.status(502).json({ error: e.message });
  }
};
