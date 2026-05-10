// Consumet-backed home sections
const CONSUMET = process.env.CONSUMET_URL || '';
const SOURCE = 'mangakakalot';

const statusMap = s => {
  if (!s) return 'ongoing';
  const l = s.toLowerCase();
  if (l.includes('complet')) return 'completed';
  if (l.includes('hiatus')) return 'hiatus';
  if (l.includes('cancel') || l.includes('discontinu')) return 'cancelled';
  return 'ongoing';
};

function mapItem(m) {
  return {
    id: m.id,
    title: m.title || 'Untitled',
    coverUrl: m.image || null,
    coverReferer: m.headerForImage?.Referer || 'https://readmanganato.com/',
    status: statusMap(m.status),
    year: null,
    rating: m.rating ? Math.round(parseFloat(m.rating) * 10) / 10 : null,
    lastChapter: null
  };
}

async function fetchSection(query) {
  try {
    const r = await fetch(`${CONSUMET}/manga/${SOURCE}/${encodeURIComponent(query)}?page=1`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.results || []).slice(0, 18);
  } catch { return []; }
}

module.exports = async (req, res) => {
  if (!CONSUMET) return res.status(503).json({ error: 'CONSUMET_URL not set' });

  const [trending, updated, newManga, topRated] = await Promise.all([
    fetchSection('popular manga'),
    fetchSection('latest manga'),
    fetchSection('new manga 2024'),
    fetchSection('best manga')
  ]);

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.json({
    trending: trending.map(mapItem),
    updated: updated.map(mapItem),
    newManga: newManga.map(mapItem),
    topRated: topRated.map(mapItem)
  });
};
