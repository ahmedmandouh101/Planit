const specification = require('../docs/openapi');

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ],
  );

exports.specification = (req, res) => res.json(specification);

exports.index = (req, res) => {
  const sections = specification.tags
    .map(({ name }) => {
      const operations = Object.entries(specification.paths)
        .flatMap(([path, methods]) =>
          Object.entries(methods)
            .filter(([, operation]) => operation.tags.includes(name))
            .map(
              ([method, operation]) =>
                `<details><summary><strong>${escapeHtml(method.toUpperCase())}</strong> <code>${escapeHtml(path)}</code> — ${escapeHtml(operation.summary)}</summary><p>${escapeHtml(operation.description || '')}</p><p>Authentication: ${operation.security.length ? 'JWT cookie or bearer token; role restrictions may also apply.' : 'No JWT required; check endpoint-specific requirements.'}</p><pre>${escapeHtml(JSON.stringify(operation, null, 2))}</pre></details>`,
            ),
        )
        .join('');
      return `<section><h2>${escapeHtml(name)}</h2>${operations}</section>`;
    })
    .join('');
  res
    .type('html')
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Planit API documentation</title><link rel="stylesheet" href="/api-docs.css"></head><body><main><a href="/">← Planit</a><h1>Planit core API</h1><p>${escapeHtml(specification.info.description)}</p><p><a href="/docs/openapi.json">Download OpenAPI 3.0 JSON</a> · Import the URL into an OpenAPI-compatible client to explore requests.</p><p>This read-only reference never sends API mutations or stores credentials. Expand an endpoint for its contract. Schema references are defined in the downloadable document.</p>${sections}</main></body></html>`,
    );
};
