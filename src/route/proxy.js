// src/route/proxy.js
import express from "express";
import { URL } from "url";

const router = express.Router();

/* -------- helpers nom/extension -------- */
function cleanName(name) {
  return (name || "").replace(/[\\\/]+/g, " ").trim() || "file";
}
function hasExt(name) {
  return /\.[a-z0-9]{1,6}$/i.test(name || "");
}
function extFromPath(pathname = "") {
  const m = pathname.match(/\.([a-z0-9]{1,6})(?:\?|#|$)/i);
  return m ? m[1].toLowerCase() : null;
}
function extFromContentType(ct = "") {
  const m = ct.toLowerCase();
  const map = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/plain": "txt",
    "application/json": "json",
  };
  return map[m] || null;
}
function withDl(u, filename) {
  const out = new URL(u.toString());
  if (filename) out.searchParams.set("dl", filename);
  return out;
}
function withFlAttachment(u, filename) {
  const out = new URL(u.toString());
  if (!filename) return out;
  if (!out.pathname.includes("/upload/")) return out;
  const enc = encodeURIComponent(filename);
  out.pathname = out.pathname.replace("/upload/", `/upload/fl_attachment:${enc}/`);
  return out;
}

/* -------- streaming -------- */
async function streamToClient(urlObj, res, baseFilename) {
  const up = await fetch(urlObj.toString(), { redirect: "follow" });
  if (!up.ok) return { ok: false, status: up.status };

  // détermine un nom AVEC extension
  const ct = up.headers.get("content-type") || "application/octet-stream";
  let finalName = cleanName(baseFilename);
  if (!hasExt(finalName)) {
    const extPath = extFromPath(urlObj.pathname);
    const extCT = extFromContentType(ct);
    const ext = extPath || extCT;
    if (ext) finalName = `${finalName}.${ext}`;
  }

  res.setHeader("Content-Type", ct);
  res.setHeader("Content-Disposition", `attachment; filename="${finalName}"`);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");

  if (!up.body) return { ok: false, status: 500, reason: "no body" };
  up.body.pipe(res);
  return { ok: true };
}

/* -------- route -------- */
/**
 * GET /api/download?url=<cloudinaryUrl>&filename=<nom (avec ou sans extension)>
 * - Streame l’asset et ajoute l’extension si absente (depuis Content-Type ou chemin)
 * - Fallback avec fl_attachment puis redirection si nécessaire
 */
router.get("/download", async (req, res) => {
  const rawUrl = req.query?.url;
  const requestedName = cleanName(req.query?.filename);

  if (!rawUrl) return res.status(400).json({ ok: false, error: "Missing url param" });

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid url param" });
  }

  // on accepte *.cloudinary.com
  const host = (target.hostname || "").toLowerCase();
  const isCloudinary = host.endsWith(".cloudinary.com");
  if (!isCloudinary) {
    // ne bloque pas: redirection simple (le navigateur prendra le nom par défaut)
    return res.redirect(302, withDl(target, requestedName).toString());
  }

  try {
    // A) stream + ?dl= (on fixera l'extension côté serveur)
    const A = withDl(target, requestedName);
    const a = await streamToClient(A, res, requestedName);
    if (a.ok) return;

    // B) stream avec fl_attachment + ?dl=
    const B = withDl(withFlAttachment(target, requestedName), requestedName);
    const b = await streamToClient(B, res, requestedName);
    if (b.ok) return;

    // C) redirection 302 (au cas où)
    // on ajoute une extension probable pour la redirection (depuis le chemin)
    let nameForRedirect = requestedName;
    if (!hasExt(nameForRedirect)) {
      const extP = extFromPath(target.pathname);
      if (extP) nameForRedirect = `${nameForRedirect}.${extP}`;
    }
    const C = withDl(withFlAttachment(target, nameForRedirect), nameForRedirect);
    return res.redirect(302, C.toString());
  } catch {
    const F = withDl(target, requestedName);
    return res.redirect(302, F.toString());
  }
});

export default router;
