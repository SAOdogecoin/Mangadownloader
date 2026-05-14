// Suwayomi-backed home — fans out popular + latest across multiple sources
const SUWAYOMI = process.env.SUWAYOMI_URL || '';
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
    lastChapter: null,
    source: 'alt'
  };
}

async function fetchSection(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const text = await r.text();
    if (!text.startsWith('{')) return []; // skip Cloudflare-blocked plaintext
    const d = JSON.parse(text);
    return (d.mangaList || []).map(mapItem);
  } catch { return []; }
}

// Interleave results from multiple sources, dedupe by title
function mergeUnique(lists) {
  const merged = [];
  const seen = new Set();
  const maxLen = Math.max(...lists.map(l => l.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (!list[i]) continue;
      const key = list[i].title.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(list[i]);
    }
  }
  return merged;
}

module.exports = async (req, res) => {
  if (!SUWAYOMI || !SOURCE_IDS.length) return res.status(503).json({ error: 'SUWAYOMI_URL or SUWAYOMI_SOURCE_ID(S) not set' });

  // Fan out: for each source, fetch popular+latest in parallel
  const tasks = [];
  for (const sid of SOURCE_IDS) {
    tasks.push(fetchSection(`${SUWAYOMI}/api/v1/source/${sid}/popular/1`));
    tasks.push(fetchSection(`${SUWAYOMI}/api/v1/source/${sid}/latest/1`));
  }
  const all = await Promise.all(tasks);

  // Separate popular and latest by index (even = popular, odd = latest)
  const popularLists = all.filter((_, i) => i % 2 === 0);
  const latestLists = all.filter((_, i) => i % 2 === 1);

  const popular = mergeUnique(popularLists).slice(0, 24);
  const latest = mergeUnique(latestLists).slice(0, 24);

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.json({
    trending: popular.slice(0, 12),
    updated: latest.slice(0, 12),
    newManga: popular.slice(12, 24),
    topRated: latest.slice(12, 24)
  });
};
