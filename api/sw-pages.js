// Suwayomi-backed chapter page reader
// Expects id = "sw:{internalMangaId}:{chapterIndex}"
const SUWAYOMI = process.env.SUWAYOMI_URL || '';

module.exports = async (req, res) => {
  if (!SUWAYOMI) return res.status(503).json({ error: 'SUWAYOMI_URL not set' });
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  // Parse "sw:123:0" → mangaId=123, chapterIndex=0
  const match = id.match(/^sw:(\d+):(\d+)$/);
  if (!match) return res.status(400).json({ error: 'Invalid id format, expected sw:{mangaId}:{chapterIndex}' });
  const [, mangaId, chapterIndex] = match;

  try {
    // Trigger online fetch of chapter to get pageCount
    const chapRes = await fetch(
      `${SUWAYOMI}/api/v1/manga/${mangaId}/chapter/${chapterIndex}?onlineFetch=true`
    );
    if (!chapRes.ok) throw new Error(`Suwayomi chapter ${chapRes.status}`);
    const chapData = await chapRes.json();
    const pageCount = chapData.pageCount || chapData.lastPageRead || 0;

    if (!pageCount) throw new Error('No pages found for this chapter');

    // Build page URLs — Suwayomi serves pages as images directly
    // These URLs will be fetched by the frontend via our proxy
    const pages = Array.from({ length: pageCount }, (_, i) =>
      `${SUWAYOMI}/api/v1/manga/${mangaId}/chapter/${chapterIndex}/page/${i}`
    );

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.json({ pages, pagesFallback: [], total: pages.length });
  } catch (e) {
    console.error('[sw-pages]', e.message);
    res.status(502).json({ error: e.message });
  }
};
