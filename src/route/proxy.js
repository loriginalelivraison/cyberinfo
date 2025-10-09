// src/route/proxy.js
import express from "express";
import { URL } from "url";

const router = express.Router();

/* -------- helpers nom/extension -------- */
function cleanName(name) {
  return (name || "").replace(/[\\\/]+/g, " ").trim();
}
function hasExt(name) {
  return /\.[a-z0-9]{1,6}$/i.test(name || "");
}
function extFromPath(pathname = "") {
  // essaie d'abord la fin (public_id.ext) sinon, le dernier segment "xxx.ext"
  const m = pathname.match(/\.([a-z0-9]{1,6})(?:\?|#|$)/i);
  return m ? m[1].toLowerCase() : null;
}
function extFromContentType(ct = "") {
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
  return map[(ct || "").toLowerCase()] || null;
}
function ensureNameWithExt({ desiredName, urlPath, contentType }) {
  let base = cleanName(desiredName) || "";                // peut être vide
  let ext = null;

  // 1) essaie l’ext depuis l’URL
  ext = extFromPath(urlPath);

  // 2) si pas d’ext trouvée, on tentera via Content-Type plus tard
  if (!base) {
    // si aucun nom demandé, prends le dernier segment de l’URL (sans query)
    const seg = (urlPath || "").split("/").pop() || "file";
    base = seg.replace(/\.[a-z0-9]{1,6}$/i, "");         // enlève ext si présente
  } else {
    // si un nom est fourni et a déjà une ext, on garde
    if (hasExt(base)) return base;
  }

  // si base n’a pas d’ext, tente Content-Type
  if (!ext && contentType) {
    ext = extFromContentType(contentType);
  }

  return ext ? `${base}.${ext}` : base;                   // si pas d’ext => au moins un nom lisible
}

/* -------- URL helpers -------- */
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
async function streamToClient(urlObj, res, requestedName) {
  const upstream = await fetch(urlObj.toString(), { redirect: "follow" });
  if (!upstream.ok) return { ok: false, status: upstream.status };

  const ct = upstream.headers.get("content-type") || "application/octet-stream";
  const finalName = ensureNameWithExt({
    desiredName: requestedName,
    urlPath: urlObj.pathname,
    contentType: ct,
  }) || "file";

  // Content-Disposition robuste: filename + filename* (RFC 5987)
  const asciiName = finalName.replace(/[^\x20-\x7E]+/g, "_"); // fallback ASCII
  const utf8Name = encodeURIComponent(finalName).replace(/'/g, "%27");

  res.setHeader("Content-Type", ct);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`
  );
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");

  if (!upstream.body) return { ok: false, status: 500, reason: "no body" };
  upstream.body.pipe(res);
  return { ok: true };
}

/* -------- route -------- */
/**
 * GET /api/download?url=<cloudinaryUrl>&filename=<nom (avec ou sans extension)>
 * - Streame l’asset et **ajoute l’extension si absente** (depuis Content-Type ou chemin)
 * - Fallback avec fl_attachment puis redirection si nécessaire
 * - N’EXIGE PAS que filename soit fourni par le front
 */
router.get("/download", async (req, res) => {
  const rawUrl = req.query?.url;
  const requestedName = cleanName(req.query?.filename); // peut être vide

  if (!rawUrl) return res.status(400).json({ ok: false, error: "Missing url param" });

  let target;
  try { target = new URL(rawUrl); }
  catch { return res.status(400).json({ ok: false, error: "Invalid url param" }); }

  // Cloudinary seulement (plus tolérant: *.cloudinary.com)
  const host = (target.hostname || "").toLowerCase();
  const isCloudinary = host.endsWith(".cloudinary.com");
  if (!isCloudinary) {
    return res.redirect(302, withDl(target, requestedName).toString());
  }

  try {
    // A) stream + ?dl=
    const A = withDl(target, requestedName);
    const a = await streamToClient(A, res, requestedName);
    if (a.ok) return;

    // B) stream avec fl_attachment + ?dl=
    const B = withDl(withFlAttachment(target, requestedName), requestedName);
    const b = await streamToClient(B, res, requestedName);
    if (b.ok) return;

    // C) redirection 302 (garde un nom plausible côté Cloudinary)
    //      on ajoute au moins ?dl=<nom> (si Cloudinary l’honore)
    return res.redirect(302, B.toString());
  } catch {
    // ultime fallback: redirect simple
    return res.redirect(302, withDl(target, requestedName).toString());
  }
});

export default router;
