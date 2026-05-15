const adapt = require('./_adapt');
const handler = require('../../api/search.js');
exports.handler = adapt(handler);
