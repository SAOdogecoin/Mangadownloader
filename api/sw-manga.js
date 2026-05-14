// Suwayomi-backed manga detail + chapters
// id = internal Suwayomi manga ID (numeric string)
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
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const [mangaRes, chapRes] = await Promise.all([
      fetch(`${SUWAYOMI}/api/v1/manga/${id}?onlineFetch=true`),
      fetch(`${SUWAYOMI}/api/v1/manga/${id}/chapters?onlineFetch=true`)
    ]);

    if (!mangaRes.ok) throw new Error(`Suwayomi manga ${mangaRes.status}`);
    if (!chapRes.ok) throw new Error(`Suwayomi chapters ${chapRes.status}`);

    const mangaData = await mangaRes.json();
    const chapData = await chapRes.json();

    // Prefix relative thumbnail URL with Suwayomi server URL
    const thumb = mangaData.thumbnailUrl
      ? (mangaData.thumbnailUrl.startsWith('http') ? mangaData.thumbnailUrl : `${SUWAYOMI}${mangaData.thumbnailUrl}`)
      : null;

    // Parse genres (can be array or comma string)
    let genres = [];
    if (Array.isArray(mangaData.genre)) genres = mangaData.genre;
    else if (typeof mangaData.genre === 'string') genres = mangaData.genre.split(',').map(g => g.trim()).filter(Boolean);

    const manga = {
      id: String(id),
      title: mangaData.title || 'Untitled',
      description: (mangaData.description || '').replace(/\[.*?\]/g, '').trim(),
      coverUrl: thumb,
      coverReferer: null,
      status: statusMap(mangaData.status),
      year: null,
      tags: genres.map(g => ({ name: g, id: g })),
      originalLanguage: 'ja',
      rating: null,
      follows: null,
      source: 'alt'
    };

    // Suwayomi returns chapters newest-first; reverse for ascending order
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
        publishAt: ch.uploadDate ? new Date(Number(ch.uploadDate)).toISOString() : null
      };
    });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.json({ manga, chapters });
  } catch (e) {
    console.error('[sw-manga]', e.message);
    res.status(502).json({ error: e.message });
  }
};
