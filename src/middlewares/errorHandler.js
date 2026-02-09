const { fail } = require('../utils/apiResponse');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Prisma common errors
  if (err && err.code === 'P2002') {
    return fail(res, { status: 409, message: 'Duplicate value', errors: [{ message: 'Duplicate value' }] });
  }

  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  if (status >= 500) {
    // keep server logs; client gets generic message in prod
    // eslint-disable-next-line no-console
    console.error(err);
  }

  return fail(res, { status, message, errors: err.errors });
}

module.exports = { errorHandler };


