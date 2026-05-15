const adapt = require('./_adapt');
const handler = require('../../api/pages.js');
exports.handler = adapt(handler);
