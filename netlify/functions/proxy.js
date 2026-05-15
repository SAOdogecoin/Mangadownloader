const adapt = require('./_adapt');
const handler = require('../../api/proxy.js');
exports.handler = adapt(handler);
