// Adapter — runs Vercel-style (req, res) handlers as Netlify functions
module.exports = function adaptVercelHandler(handler) {
  return async (event) => {
    const req = {
      query: event.queryStringParameters || {},
      method: event.httpMethod,
      headers: event.headers || {},
      body: event.body
    };

    let statusCode = 200;
    const respHeaders = {};
    let bodyData = '';
    let isBase64 = false;

    const res = {
      status: c => { statusCode = c; return res; },
      setHeader: (k, v) => { respHeaders[k.toLowerCase()] = String(v); },
      json: d => {
        respHeaders['content-type'] = 'application/json';
        bodyData = JSON.stringify(d);
      },
      send: d => {
        if (Buffer.isBuffer(d)) {
          bodyData = d.toString('base64');
          isBase64 = true;
        } else if (typeof d === 'object') {
          respHeaders['content-type'] = respHeaders['content-type'] || 'application/json';
          bodyData = JSON.stringify(d);
        } else {
          bodyData = String(d);
        }
      },
      end: d => res.send(d ?? '')
    };

    try {
      await handler(req, res);
    } catch (e) {
      statusCode = 500;
      bodyData = JSON.stringify({ error: e.message });
      respHeaders['content-type'] = 'application/json';
    }

    return {
      statusCode,
      headers: respHeaders,
      body: bodyData,
      isBase64Encoded: isBase64
    };
  };
};
