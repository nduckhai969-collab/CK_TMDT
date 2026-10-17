// Only retain a browser origin that is explicitly trusted by the CORS config.
function allowedFrontendOrigin(origin) {
  if (!origin) return '';
  try {
    const candidate = new URL(origin).origin;
    const allowed = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    return allowed.includes(candidate) ? candidate : '';
  } catch (_) {
    return '';
  }
}

module.exports = { allowedFrontendOrigin };
