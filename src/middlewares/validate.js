const { fail } = require('../utils/apiResponse');

function validate(schema) {
  return function validator(req, res, next) {
    const { error, value } = schema.validate(
      {
        body: req.body,
        query: req.query,
        params: req.params,
      },
      { abortEarly: false, stripUnknown: true },
    );

    if (error) {
      return fail(res, {
        status: 400,
        message: 'Validation error',
        errors: error.details.map((d) => ({
          field: d.path?.slice(1).join('.') || undefined,
          message: d.message,
        })),
      });
    }

    req.body = value.body;
    req.query = value.query;
    req.params = value.params;

    return next();
  };
}

module.exports = { validate };


