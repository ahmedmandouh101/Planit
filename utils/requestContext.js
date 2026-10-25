const { randomUUID } = require('node:crypto');

module.exports = (req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  const started = process.hrtime.bigint();
  let recorded = false;
  const record = () => {
    if (recorded) return;
    recorded = true;
    if (process.env.NODE_ENV !== 'production') return;
    console.log(JSON.stringify({
      event: 'http_request',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      method: req.method,
      route: req.route ? req.baseUrl + req.route.path : 'unmatched',
      statusCode: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - started) / 1e6,
      aborted: !res.writableFinished,
    }));
  };
  res.once('finish', record);
  res.once('close', record);
  next();
};
