import express from "express";
import multer from "multer";
import streamifier from "streamifier";
import cloudinary from "../cloudinary.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

function uploadStreamToCloudinary({ file, resource_type = "image", folder = "cyberinfo/docs" }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type, folder },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    streamifier.createReadStream(file.buffer).pipe(stream);
  });
}

async function handleUpload(req, res, { resource_type, folder, label }) {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "No file" });

    console.log(`[UPLOAD] ${label} start`, {
      name: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      resource_type,
      folder,
    });

    const result = await uploadStreamToCloudinary({
      file: req.file,
      resource_type,
      folder,
    });

    console.log(`[UPLOAD] ${label} OK`, result.public_id);

    return res.json({
      ok: true,
      url: result.secure_url,
      public_id: result.public_id,
      bytes: result.bytes,
      format: result.format,
      resource_type: result.resource_type,
      originalname: req.file.originalname,
    });
  } catch (e) {
    console.error(`[UPLOAD] ${label} ERROR:`, e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}

// routes
router.post("/upload/image", upload.single("file"), (req, res) =>
  handleUpload(req, res, { resource_type: "image", folder: "cyberinfo/docs/images", label: "IMAGE" })
);

router.post("/upload/video", upload.single("file"), (req, res) =>
  handleUpload(req, res, { resource_type: "video", folder: "cyberinfo/docs/videos", label: "VIDEO" })
);

router.post("/upload/pdf", upload.single("file"), (req, res) =>
  handleUpload(req, res, { resource_type: "raw", folder: "cyberinfo/docs/pdfs", label: "PDF" })
);

router.post("/upload/file", upload.single("file"), (req, res) =>
  handleUpload(req, res, { resource_type: "raw", folder: "cyberinfo/docs/files", label: "FILE" })
);

router.get("/upload/test", (_req, res) => res.json({ ok: true, msg: "upload routes mounted" }));

export default router;
