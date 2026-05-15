const adapt = require('./_adapt');
const handler = require('../../api/mangaplus.js');
exports.handler = adapt(handler);
