// Suwayomi-backed manga search — fans out to multiple sources in parallel
const SUWAYOMI = process.env.SUWAYOMI_URL || '';
// Accept either SUWAYOMI_SOURCE_IDS (comma-separated) or single SUWAYOMI_SOURCE_ID
const SOURCE_IDS = (process.env.SUWAYOMI_SOURCE_IDS || process.env.SUWAYOMI_SOURCE_ID || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function mapItem(m) {
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
    source: 'alt'
  };
}

async function searchOne(sourceId, q) {
  try {
    const r = await fetch(`${SUWAYOMI}/api/v1/source/${sourceId}/search?searchTerm=${encodeURIComponent(q)}&pageNum=1`);
    if (!r.ok) return [];
    const text = await r.text();
    // Suwayomi sometimes returns plaintext error like "Cloudflare bypass currently disabled"
    if (!text.startsWith('{')) return [];
    const data = JSON.parse(text);
    return (data.mangaList || []).map(mapItem);
  } catch { return []; }
}

module.exports = async (req, res) => {
  if (!SUWAYOMI || !SOURCE_IDS.length) return res.status(503).json({ error: 'SUWAYOMI_URL or SUWAYOMI_SOURCE_ID(S) not set' });
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing q' });

  try {
    // Fan out across all configured sources
    const allResults = await Promise.all(SOURCE_IDS.map(sid => searchOne(sid, q)));

    // Merge + dedupe by lowercase title
    const merged = [];
    const seen = new Set();
    // Interleave results from each source so user sees variety
    const maxLen = Math.max(...allResults.map(r => r.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const list of allResults) {
        if (!list[i]) continue;
        const key = list[i].title.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(list[i]);
      }
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json({ results: merged });
  } catch (e) {
    console.error('[sw-search]', e.message);
    res.status(502).json({ error: e.message });
  }
};
