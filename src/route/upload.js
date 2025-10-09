// route/upload.js
import express from "express";
import multer from "multer";
import cloudinary from "./cloudinary.js";
import streamifier from "streamifier";

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

/* ---------- PING (GET) ----------
   Permet de vérifier: GET /api/upload/ping -> { ok:true }
*/
router.get("/upload/ping", (_req, res) => {
  return res.json({ ok: true, msg: "upload routes mounted" });
});

/* ---------- DIAG Cloudinary (GET) ----------
   GET /api/diag/cloudinary -> montre si les env sont présents
*/
router.get("/diag/cloudinary", (_req, res) => {
  const present = {
    CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
  };
  const sampleCfg = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || null,
    api_key: (process.env.CLOUDINARY_API_KEY || "").slice(0, 4) + "***",
  };
  return res.json({ ok: true, present, sampleCfg });
});

/* ---------- SELFTEST (POST, sans multer) ----------
   POST /api/upload/_selftest
   Envoie une mini image 1x1 directement à Cloudinary.
*/
router.post("/upload/_selftest", async (_req, res) => {
  try {
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFVgJt+0DgYQAAAABJRU5ErkJggg==";
    const dataUrl = `data:image/png;base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: "cyberinfo/docs/selftest",
      resource_type: "image",
      use_filename: true,
      unique_filename: true,
    });

    return res.json({
      ok: true,
      public_id: result.public_id,
      url: result.secure_url,
      resource_type: result.resource_type,
    });
  } catch (e) {
    console.error("[SELFTEST] ERROR:", e?.message, e);
    return res.status(500).json({ ok: false, where: "selftest", error: e?.message || "Selftest failed" });
  }
});

/* ---------- helpers communs ---------- */
function mustHaveCloudinaryEnv() {
  const miss = [];
  if (!process.env.CLOUDINARY_CLOUD_NAME) miss.push("CLOUDINARY_CLOUD_NAME");
  if (!process.env.CLOUDINARY_API_KEY) miss.push("CLOUDINARY_API_KEY");
  if (!process.env.CLOUDINARY_API_SECRET) miss.push("CLOUDINARY_API_SECRET");
  return miss;
}

function uploadStreamToCloudinary({ file, resource_type = "image", folder = "cyberinfo/docs" }) {
  return new Promise((resolve, reject) => {
    const cld = cloudinary.uploader.upload_stream(
      { resource_type, folder },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    streamifier.createReadStream(file.buffer).pipe(cld);
  });
}

async function handleUpload(req, res, { resource_type, folder, label }) {
  try {
    const missing = mustHaveCloudinaryEnv();
    if (missing.length) {
      console.error("[UPLOAD] Missing env:", missing);
      return res.status(500).json({ ok: false, error: `Missing env: ${missing.join(", ")}` });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No file" });
    }

    console.log(`[UPLOAD] ${label} start`, {
      name: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      resource_type,
      folder,
    });

    const result = await uploadStreamToCloudinary({ file: req.file, resource_type, folder });

    console.log(`[UPLOAD] ${label} OK`, {
      public_id: result.public_id,
      bytes: result.bytes,
      format: result.format,
      resource_type: result.resource_type,
      url: result.secure_url,
    });

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
    const payload = {
      ok: false,
      error: e?.message || "Upload failed",
      name: e?.name || null,
      http_code: e?.http_code || null,
    };
    console.error(`[UPLOAD] ${label} ERROR:`, payload, e);
    return res.status(500).json(payload);
  }
}

/* ---------- ROUTES d'UPLOAD (POST multipart/form-data) ---------- */
router.post("/upload/image", upload.single("file"), async (req, res) => {
  await handleUpload(req, res, { resource_type: "image", folder: "cyberinfo/docs/images", label: "IMAGE" });
});

router.post("/upload/video", upload.single("file"), async (req, res) => {
  await handleUpload(req, res, { resource_type: "video", folder: "cyberinfo/docs/videos", label: "VIDEO" });
});

router.post("/upload/pdf", upload.single("file"), async (req, res) => {
  await handleUpload(req, res, { resource_type: "raw", folder: "cyberinfo/docs/pdfs", label: "PDF" });
});

router.post("/upload/file", upload.single("file"), async (req, res) => {
  await handleUpload(req, res, { resource_type: "raw", folder: "cyberinfo/docs/files", label: "FILE" });
});

export default router;
