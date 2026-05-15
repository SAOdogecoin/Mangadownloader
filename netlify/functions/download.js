const adapt = require('./_adapt');
const handler = require('../../api/download.js');
exports.handler = adapt(handler);
