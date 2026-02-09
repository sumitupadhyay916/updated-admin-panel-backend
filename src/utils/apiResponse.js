function ok(res, { message = 'OK', data, meta,status = 200 } = {}) {
  const payload = { success: true, message };
  if (data !== undefined) payload.data = data;
  if (meta !== undefined) payload.meta = meta;
  return res.json(payload);
}

function fail(res, { message = 'Request failed', errors, status = 400 } = {}) {
  const payload = { success: false, message };
  if (errors) payload.errors = errors;
  return res.status(status).json(payload);
}

module.exports = { ok, fail };


