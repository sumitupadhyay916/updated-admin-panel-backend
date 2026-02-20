const cloudinary = require('cloudinary').v2;
const { ok, fail } = require('../utils/apiResponse');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadImage(req, res) {
  if (!req.file) {
    return fail(res, { status: 400, message: 'No file uploaded' });
  }

  return new Promise((resolve) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'products',
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 1200, crop: 'limit' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error) {
          console.error('[Upload] Cloudinary error:', error);
          resolve(fail(res, { status: 500, message: 'Image upload failed' }));
        } else {
          resolve(ok(res, { message: 'Image uploaded', data: { url: result.secure_url } }));
        }
      }
    );
    uploadStream.end(req.file.buffer);
  });
}

module.exports = { uploadImage };
