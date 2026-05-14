// Suwayomi-backed manga detail + chapters
// Chapter IDs use format: sw:{internalId}:{chapterIndex}
const SUWAYOMI = process.env.SUWAYOMI_URL || '';
const SOURCE_ID = process.env.SUWAYOMI_SOURCE_ID || '';

const statusMap = s => {
  if (!s) return 'ongoing';
  const l = s.toLowerCase();
  if (l.includes('complet')) return 'completed';
  if (l.includes('hiatus')) return 'hiatus';
  if (l.includes('cancel') || l.includes('discontinu')) return 'cancelled';
  return 'ongoing';
};

module.exports = async (req, res) => {
  if (!SUWAYOMI || !SOURCE_ID) return res.status(503).json({ error: 'SUWAYOMI_URL or SUWAYOMI_SOURCE_ID not set' });
  const { id } = req.query; // id = source-relative manga URL from sw-search
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    // Fetch/create manga in Suwayomi DB by source + URL
    // This endpoint creates the entry if it doesn't exist and returns the internal ID
    const mangaRes = await fetch(
      `${SUWAYOMI}/api/v1/manga?sourceId=${SOURCE_ID}&url=${encodeURIComponent(id)}`
    );
    if (!mangaRes.ok) throw new Error(`Suwayomi manga lookup ${mangaRes.status}`);
    const mangaData = await mangaRes.json();
    const internalId = mangaData.id;
    if (!internalId) throw new Error('No internal ID returned from Suwayomi');

    // Fetch chapters online
    const chapRes = await fetch(
      `${SUWAYOMI}/api/v1/manga/${internalId}/chapters?onlineFetch=true`
    );
    if (!chapRes.ok) throw new Error(`Suwayomi chapters ${chapRes.status}`);
    const chapData = await chapRes.json();

    const manga = {
      id: String(internalId),
      title: mangaData.title || 'Untitled',
      description: (mangaData.description || '').replace(/\[.*?\]/g, '').trim(),
      coverUrl: mangaData.thumbnailUrl || null,
      coverReferer: 'https://readmanganato.com/',
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
      // Parse chapter number from name or chapterNumber field
      const chNum = ch.chapterNumber != null && ch.chapterNumber >= 0
        ? String(ch.chapterNumber)
        : (ch.name?.match(/chapter[\s-]*([\d.]+)/i)?.[1] || String(ch.index + 1));
      return {
        id: `sw:${internalId}:${ch.index}`,   // sw: prefix + internal manga ID + chapter index
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
