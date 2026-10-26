const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sharp = require('sharp');
const { unlink } = require('node:fs/promises');
const path = require('node:path');
const imageUpload = require('../utils/imageUpload');
const writeFields = require('../utils/writeFields');
const Features = require('../utils/apiFeatures');
const errorHandler = require('../controllers/errorController');
const tourController = require('../controllers/tourController');

let server;
let baseUrl;
before(async () => {
  const app = express();
  app.post(
    '/image',
    imageUpload.upload.single('photo'),
    async (req, res, next) => {
      try {
        const buffer = await imageUpload.jpeg(req.file.buffer, 32, 32);
        res.type('jpeg').send(buffer);
      } catch (error) {
        next(error);
      }
    },
  );
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('generic writes reject update operators, immutable fields, and forged aggregates', () => {
  for (const payload of [
    { _id: 'forged' },
    { ratingsAverage: 5 },
    { createdAt: '2000-01-01' },
    { $set: { price: 1 } },
    { 'startLocation.address': 'forged' },
  ]) {
    assert.throws(
      () => writeFields('Tour', payload),
      (error) => error.statusCode === 400,
    );
  }
  assert.deepEqual(writeFields('Tour', { name: 'Updated name', price: 50 }), {
    name: 'Updated name',
    price: 50,
  });
  assert.throws(() => writeFields('User', { password: 'unhashed' }));
  assert.throws(() => writeFields('Booking', { paid: true }));
  assert.throws(() => writeFields('Place', []));
  assert.throws(() => writeFields('Driver', {}));
});

test('pagination rejects unbounded or malformed requests and preserves valid bounds', () => {
  let skipped;
  let limited;
  const query = {
    skip(value) {
      skipped = value;
      return this;
    },
    limit(value) {
      limited = value;
      return this;
    },
  };
  for (const input of [
    { limit: '101' },
    { page: '0' },
    { page: '10001' },
    { limit: '-1' },
    { limit: '1.5' },
    { page: 'Infinity' },
    { limit: ['10'] },
    { page: {} },
  ]) {
    assert.throws(
      () => new Features(query, input).paginate(),
      (error) => error.statusCode === 400,
    );
  }
  new Features(query, { page: '2', limit: '12' }).paginate();
  assert.equal(skipped, 12);
  assert.equal(limited, 12);
  new Features(query, {}).paginate();
  assert.equal(limited, 100);
});

async function upload(buffer, mime) {
  const form = new FormData();
  form.append('photo', new Blob([buffer], { type: mime }), 'test-image');
  return fetch(`${baseUrl}/image`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(10000),
  });
}

test('real multipart images are decoded, resized, and re-encoded as JPEG', async () => {
  const png = await sharp({
    create: { width: 64, height: 48, channels: 3, background: '#225544' },
  })
    .png()
    .toBuffer();
  const response = await upload(png, 'image/png');
  assert.equal(response.status, 200);
  const metadata = await sharp(
    Buffer.from(await response.arrayBuffer()),
  ).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 32);
  assert.equal(metadata.height, 32);
  assert.equal(metadata.exif, undefined);
});

test('upload rejects spoofed image content, SVG, and files exceeding 5 MiB', async () => {
  for (const [buffer, mime, code] of [
    [Buffer.from('not-an-image'), 'image/png', 400],
    [Buffer.from('<svg/>'), 'image/svg+xml', 400],
    [Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png', 413],
  ]) {
    const response = await upload(buffer, mime);
    assert.equal(response.status, code);
    const payload = await response.json();
    assert.equal(payload.stack, undefined);
  }
});

test('tour cover uploads work without requiring additional gallery files', async () => {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#225544' },
  })
    .png()
    .toBuffer();
  const request = {
    body: {},
    params: { id: '../../untrusted' },
    files: { imageCover: [{ fieldname: 'imageCover', buffer: png }] },
  };
  try {
    await new Promise((resolve, reject) =>
      tourController.resizeTourImages(request, {}, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    assert.match(request.body.imageCover, /^tour-[a-f0-9-]+\.jpeg$/);
    assert.equal(request.body.images, undefined);
  } finally {
    if (request.body.imageCover)
      await unlink(
        path.join(__dirname, '../public/img/tours', request.body.imageCover),
      );
  }
});

test('tour gallery uploads preserve order without requiring a cover', async () => {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#225544' },
  })
    .png()
    .toBuffer();
  const request = {
    body: {},
    files: {
      images: [
        { fieldname: 'images', buffer: png },
        { fieldname: 'images', buffer: png },
      ],
    },
  };
  try {
    await new Promise((resolve, reject) =>
      tourController.resizeTourImages(request, {}, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    assert.equal(request.body.imageCover, undefined);
    assert.equal(request.body.images.length, 2);
    assert.equal(new Set(request.body.images).size, 2);
  } finally {
    for (const filename of request.body.images || [])
      await unlink(path.join(__dirname, '../public/img/tours', filename));
  }
});
