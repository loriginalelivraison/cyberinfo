import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// --- dossiers ---------------------------------------------------------------
const baseDir   = path.resolve("uploads");
const pdfsDir   = path.join(baseDir, "pdfs");
const imagesDir = path.join(baseDir, "images");
const mediaDir  = path.join(baseDir, "videos"); // vidéos + audios
const filesDir  = path.join(baseDir, "files");  // tout le reste : docx, xlsx, zip, apk, etc.

for (const d of [baseDir, pdfsDir, imagesDir, mediaDir, filesDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// --- helpers ----------------------------------------------------------------
function storageTo(dir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, unique + path.extname(file.originalname));
    },
  });
}

function filterPdf(_req, file, cb) {
  if (file.mimetype === "application/pdf") cb(null, true);
  else cb(new Error("Seuls les PDF sont autorisés"));
}
function filterImage(_req, file, cb) {
  if (file.mimetype.startsWith("image/")) cb(null, true);
  else cb(new Error("Seules les images sont autorisées"));
}
function filterMedia(_req, file, cb) {
  if (file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/")) cb(null, true);
  else cb(new Error("Seules les vidéos/audios sont autorisées"));
}
// ✅ accepte tout (apk/exe inclus) — à utiliser avec limites !
function filterAny(_req, _file, cb) {
  cb(null, true);
}

// Limites (MB) — ajuste au besoin
const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB || 25);
const MAX_MEDIA_MB = Number(process.env.MAX_MEDIA_MB || 500);
const MAX_FILE_MB  = Number(process.env.MAX_FILE_MB  || 200);

const uploadPdf   = multer({ storage: storageTo(pdfsDir),   fileFilter: filterPdf });
const uploadImage = multer({ storage: storageTo(imagesDir), fileFilter: filterImage, limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024 } });
const uploadMedia = multer({ storage: storageTo(mediaDir),  fileFilter: filterMedia, limits: { fileSize: MAX_MEDIA_MB * 1024 * 1024 } });
const uploadFile  = multer({ storage: storageTo(filesDir),  fileFilter: filterAny,   limits: { fileSize: MAX_FILE_MB  * 1024 * 1024 } });

// URL publique
function publicUrl(req, subdir, filename) {
  return `${req.protocol}://${req.get("host")}/uploads/${subdir}/${filename}`;
}
// sécuriser la jointure du chemin
function safeJoin(base, file) {
  const p = path.normalize(path.join(base, file));
  return p.startsWith(base) ? p : null;
}

// --- UPLOADS ----------------------------------------------------------------
router.post("/pdf", uploadPdf.single("file"), (req, res) => {
  const url = publicUrl(req, "pdfs", req.file.filename);
  res.json({ ok: true, url, bytes: req.file.size, originalname: req.file.originalname });
});
router.post("/image", uploadImage.single("file"), (req, res) => {
  const url = publicUrl(req, "images", req.file.filename);
  res.json({ ok: true, url, bytes: req.file.size, originalname: req.file.originalname });
});
router.post("/video", uploadMedia.single("file"), (req, res) => {
  const url = publicUrl(req, "videos", req.file.filename);
  res.json({ ok: true, url, bytes: req.file.size, originalname: req.file.originalname });
});
// ✅ route générique — accepte tout (docx/xlsx/pptx/csv/zip/rar/7z/apk/exe/etc.)
router.post("/file", uploadFile.single("file"), (req, res) => {
  const url = publicUrl(req, "files", req.file.filename);
  res.json({ ok: true, url, bytes: req.file.size, originalname: req.file.originalname });
});

// --- DOWNLOAD forcé (Content-Disposition: attachment) -----------------------
router.get("/pdf/:filename", (req, res) => {
  const filePath = safeJoin(pdfsDir, req.params.filename);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).send("Fichier introuvable");
  return res.download(filePath, req.params.filename);
});
router.get("/image/:filename", (req, res) => {
  const filePath = safeJoin(imagesDir, req.params.filename);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).send("Fichier introuvable");
  return res.download(filePath, req.params.filename);
});
router.get("/video/:filename", (req, res) => {
  const filePath = safeJoin(mediaDir, req.params.filename);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).send("Fichier introuvable");
  return res.download(filePath, req.params.filename);
});
// ✅ download générique
router.get("/file/:filename", (req, res) => {
  const filePath = safeJoin(filesDir, req.params.filename);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).send("Fichier introuvable");
  return res.download(filePath, req.params.filename);
});

export default router;
