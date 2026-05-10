// Consumet-backed manga detail + chapters
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

module.exports = async (req, res) => {
  if (!CONSUMET) return res.status(503).json({ error: 'CONSUMET_URL not set' });
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const r = await fetch(`${CONSUMET}/manga/${SOURCE}/info?id=${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(`Consumet ${r.status}`);
    const data = await r.json();

    const manga = {
      id: data.id || id,
      title: data.title || 'Untitled',
      description: (data.description || '').replace(/\[.*?\]/g, '').trim(),
      coverUrl: data.image || null,
      coverReferer: data.headerForImage?.Referer || 'https://readmanganato.com/',
      status: statusMap(data.status),
      year: null,
      tags: (data.genres || []).map(g => ({ name: g, id: g })),
      originalLanguage: 'ja',
      rating: data.rating ? Math.round(parseFloat(data.rating) * 10) / 10 : null,
      follows: null
    };

    // Chapters: Consumet returns newest first — reverse for asc order
    const rawChapters = (data.chapters || []).slice().reverse();
    const chapters = rawChapters.map((ch, i) => {
      // chapter id is the full chapterId needed for reading
      const chNum = ch.title?.match(/chapter[\s-]*([\d.]+)/i)?.[1]
        || ch.id?.match(/chapter-([\d.]+)/i)?.[1]
        || String(i + 1);
      return {
        id: ch.id,
        volume: null,
        chapter: chNum,
        title: ch.title || null,
        pages: 0,
        publishAt: ch.releasedDate || null
      };
    });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.json({ manga, chapters });
  } catch (e) {
    console.error('[cs-manga]', e.message);
    res.status(502).json({ error: e.message });
  }
};
