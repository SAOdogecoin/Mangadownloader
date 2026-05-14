// Suwayomi-backed manga detail + chapters
// id = internal Suwayomi manga ID (numeric string from sw-search/sw-home)
// Chapter IDs use format: sw:{mangaId}:{chapterIndex}
const SUWAYOMI = process.env.SUWAYOMI_URL || '';

const statusMap = s => {
  if (!s) return 'ongoing';
  const l = s.toLowerCase();
  if (l.includes('complet')) return 'completed';
  if (l.includes('hiatus')) return 'hiatus';
  if (l.includes('cancel') || l.includes('discontinu')) return 'cancelled';
  return 'ongoing';
};

module.exports = async (req, res) => {
  if (!SUWAYOMI) return res.status(503).json({ error: 'SUWAYOMI_URL not set' });
  const { id } = req.query; // internal Suwayomi manga ID
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    // Fetch manga details and chapters in parallel using internal ID
    const [mangaRes, chapRes] = await Promise.all([
      fetch(`${SUWAYOMI}/api/v1/manga/${id}?onlineFetch=true`),
      fetch(`${SUWAYOMI}/api/v1/manga/${id}/chapters?onlineFetch=true`)
    ]);

    if (!mangaRes.ok) throw new Error(`Suwayomi manga ${mangaRes.status}`);
    if (!chapRes.ok) throw new Error(`Suwayomi chapters ${chapRes.status}`);

    const mangaData = await mangaRes.json();
    const chapData = await chapRes.json();

    const manga = {
      id: String(id),
      title: mangaData.title || 'Untitled',
      description: (mangaData.description || '').replace(/\[.*?\]/g, '').trim(),
      coverUrl: mangaData.thumbnailUrl || null,
      coverReferer: null,
      status: statusMap(mangaData.status),
      year: null,
      tags: (mangaData.genre || '').split(',').map(g => g.trim()).filter(Boolean).map(g => ({ name: g, id: g })),
      originalLanguage: 'ja',
      rating: null,
      follows: null,
      source: 'alt'
    };

    // Suwayomi returns chapters newest-first; reverse for asc order
    const rawChapters = Array.isArray(chapData) ? chapData.slice().reverse() : [];
    const chapters = rawChapters.map(ch => {
      const chNum = ch.chapterNumber != null && ch.chapterNumber >= 0
        ? String(ch.chapterNumber)
        : (ch.name?.match(/chapter[\s-]*([\d.]+)/i)?.[1] || String(ch.index + 1));
      return {
        id: `sw:${id}:${ch.index}`,
        volume: null,
        chapter: chNum,
        title: ch.name || null,
        pages: ch.pageCount || 0,
        publishAt: ch.uploadDate ? new Date(ch.uploadDate).toISOString() : null
      };
    });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.json({ manga, chapters });
  } catch (e) {
    console.error('[sw-manga]', e.message);
    res.status(502).json({ error: e.message });
  }
};
