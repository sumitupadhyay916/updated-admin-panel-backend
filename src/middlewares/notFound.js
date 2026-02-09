const { fail } = require('../utils/apiResponse');

function notFound(req, res) {
  return fail(res, { status: 404, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

module.exports = { notFound };


