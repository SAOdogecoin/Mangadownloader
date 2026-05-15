const adapt = require('./_adapt');
const handler = require('../../api/manga.js');
exports.handler = adapt(handler);
