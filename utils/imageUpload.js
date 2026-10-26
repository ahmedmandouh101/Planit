const multer = require('multer');
const sharp = require('sharp');
const AppError = require('./AppError');

exports.upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 4,
    fields: 20,
    fieldSize: 16 * 1024,
    parts: 24,
  },
  fileFilter: (req, file, callback) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      return callback(null, true);
    return callback(new AppError('Upload a JPEG, PNG, or WebP image.', 400));
  },
});

exports.jpeg = async (buffer, width, height) => {
  try {
    const input = sharp(buffer, {
      limitInputPixels: 16000000,
      animated: false,
    });
    const metadata = await input.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format) ||
      (metadata.pages || 1) > 1
    )
      throw new Error('Unsupported image');
    return await input
      .rotate()
      .resize(width, height)
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AppError(
      'Invalid image. Use a non-animated JPEG, PNG, or WebP image up to 16 megapixels.',
      400,
    );
  }
};
