// Cloudflare Worker — fronts Bato.to API. Runs on Cloudflare network (CF→CF often whitelisted).
// Deploy via Cloudflare dashboard: Workers & Pages → Create Worker → paste this code → Deploy.
// Free tier: 100k req/day.

const BATO_BASE = 'https://bato.to';
const MIRRORS = ['https://bato.to', 'https://mto.to', 'https://wto.to', 'https://hto.to'];

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Origin': BATO_BASE,
  'Referer': BATO_BASE + '/'
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function batoFetch(path, opts = {}) {
  let lastErr;
  for (const base of MIRRORS) {
    try {
      const r = await fetch(base + path, { ...opts, headers: { ...COMMON_HEADERS, ...(opts.headers || {}) } });
      if (r.ok) return r;
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('All Bato mirrors failed');
}

async function gql(query, variables = {}) {
  const r = await batoFetch('/apo/', { method: 'POST', body: JSON.stringify({ query, variables }) });
  return r.json();
}

const statusMap = s => {
  if (!s) return 'ongoing';
  const l = String(s).toLowerCase();
  if (l.includes('complet')) return 'completed';
  if (l.includes('hiatus') || l.includes('pause')) return 'hiatus';
  if (l.includes('cancel') || l.includes('discontinu') || l.includes('drop')) return 'cancelled';
  return 'ongoing';
};

function mapComic(c) {
  return {
    id: String(c.id),
    title: c.name || c.data?.name || 'Untitled',
    coverUrl: c.urlCover600 || c.urlCover900 || c.urlCoverOri || c.data?.urlCover600 || null,
    coverReferer: BATO_BASE + '/',
    status: statusMap(c.statusO || c.statusT),
    year: null,
    rating: c.score_avg ? Math.round(c.score_avg * 10) / 10 : null,
    tags: (c.genres || []).map(g => ({ name: g, id: g })),
    lastChapter: c.lastChapterNode?.data?.serial ? String(c.lastChapterNode.data.serial) : null,
    source: 'bato'
  };
}

async function actionHome() {
  const Q = `query{
    get_content_browse_search(select:{page:1,size:24,sort:"field_score"}){ items{ id name urlCover600 statusO score_avg genres } }
    LATEST: get_content_browse_search(select:{page:1,size:24,sort:"field_upload"}){ items{ id name urlCover600 statusO score_avg genres } }
  }`;
  const data = await gql(Q);
  const popular = (data?.data?.get_content_browse_search?.items || []).map(mapComic);
  const latest = (data?.data?.LATEST?.items || []).map(mapComic);
  return { trending: popular.slice(0,12), updated: latest.slice(0,12), newManga: popular.slice(12,24), topRated: latest.slice(12,24) };
}

async function actionSearch(q) {
  const Q = `query($word:String!){ get_content_browse_search(select:{word:$word,page:1,size:24}){ items{ id name urlCover600 statusO score_avg genres } } }`;
  const data = await gql(Q, { word: q });
  return { results: (data?.data?.get_content_browse_search?.items || []).map(mapComic) };
}

async function actionManga(id) {
  const Q = `query($id:ID!){
    get_content_comicNode(id:$id){ data{ id name urlCover900 urlCover600 statusO score_avg genres summary{ code } origLang } }
    get_content_chapterList(comicId:$id){ data{ id serial title dname datePublic } }
  }`;
  const data = await gql(Q, { id });
  const c = data?.data?.get_content_comicNode?.data;
  if (!c) throw new Error('Manga not found');
  const chaptersRaw = data?.data?.get_content_chapterList || [];
  const manga = {
    id: String(c.id),
    title: c.name || 'Untitled',
    description: (c.summary?.code || '').replace(/\[.*?\]/g, '').trim(),
    coverUrl: c.urlCover900 || c.urlCover600 || null,
    coverReferer: BATO_BASE + '/',
    status: statusMap(c.statusO),
    year: null,
    tags: (c.genres || []).map(g => ({ name: g, id: g })),
    originalLanguage: (c.origLang || 'ja').toLowerCase().slice(0,2),
    rating: c.score_avg ? Math.round(c.score_avg * 10) / 10 : null,
    follows: null,
    source: 'bato'
  };
  const chapters = chaptersRaw.slice().reverse().map(ch => ({
    id: `bato:${ch.data.id}`,
    volume: null,
    chapter: ch.data.serial != null ? String(ch.data.serial) : '?',
    title: ch.data.title || ch.data.dname || null,
    pages: 0,
    publishAt: ch.data.datePublic ? new Date(Number(ch.data.datePublic)).toISOString() : null
  }));
  return { manga, chapters };
}

async function actionPages(rawId) {
  const id = rawId.replace(/^bato:/, '');
  const Q = `query($id:ID!){ get_content_chapterNode(id:$id){ data{ imageFile{ urlList } } } }`;
  const data = await gql(Q, { id });
  let urls = data?.data?.get_content_chapterNode?.data?.imageFile?.urlList || [];
  if (typeof urls === 'string') { try { urls = JSON.parse(urls); } catch { urls = []; } }
  if (!Array.isArray(urls) || !urls.length) throw new Error('No pages found');
  return { pages: urls, pagesFallback: [], total: urls.length };
}

// ─── Cloudflare Worker entry ──────────────────────────────────────
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const q = url.searchParams.get('q');
    const id = url.searchParams.get('id');

    try {
      let out;
      if (action === 'home') out = await actionHome();
      else if (action === 'search') {
        if (!q) throw new Error('Missing q');
        out = await actionSearch(q);
      }
      else if (action === 'manga') {
        if (!id) throw new Error('Missing id');
        out = await actionManga(id);
      }
      else if (action === 'pages') {
        if (!id) throw new Error('Missing id');
        out = await actionPages(id);
      }
      else throw new Error('Invalid action');

      return new Response(JSON.stringify(out), {
        headers: {
          'content-type': 'application/json',
          'cache-control': 's-maxage=600, stale-while-revalidate=1800',
          ...CORS
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { 'content-type': 'application/json', ...CORS }
      });
    }
  }
};
