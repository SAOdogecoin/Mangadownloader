const adapt = require('./_adapt');
const handler = require('../../api/home.js');
exports.handler = adapt(handler);
