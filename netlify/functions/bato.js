const adapt = require('./_adapt');
const handler = require('../../api/bato.js');
exports.handler = adapt(handler);
