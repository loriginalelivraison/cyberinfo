// src/route/proxy.js
import express from "express";
import { URL } from "url";

const router = express.Router();

/* ---------------- helpers nom/extension ---------------- */
function cleanName(name) {
  return (name || "").replace(/[\\\/]+/g, " ").trim();
}
function hasExt(name) {
  return /\.[a-z0-9]{1,6}$/i.test(name || "");
}
function extFromPath(pathname = "") {
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
function parseUpstreamFilename(cd = "") {
  // Ex: attachment; filename="name.pdf"; filename*=UTF-8''name.pdf
  try {
    const v = cd || "";
    // filename* (RFC 5987) prioritaire
    const star = v.match(/filename\*\s*=\s*([^;]+)/i);
    if (star) {
      let val = star[1].trim();
      // format: UTF-8''...encodé
      const m = val.match(/^[^']*''(.+)$/);
      if (m) return decodeURIComponent(m[1]);
      return decodeURIComponent(val);
    }
    // filename="..."
    const simple = v.match(/filename\s*=\s*("?)([^";]+)\1/i);
    if (simple) return simple[2].trim();
  } catch {}
  return null;
}
function ensureNameWithExt({ desiredName, urlPath, contentType, upstreamFilename }) {
  // Ordre de préférence pour le nom de base :
  // 1) upstream filename si présent
  // 2) desiredName (query "filename")
  // 3) dernier segment de l’URL
  let base = cleanName(upstreamFilename) || cleanName(desiredName);
  if (!base) {
    const seg = (urlPath || "").split("/").pop() || "file";
    base = seg.replace(/\.[a-z0-9]{1,6}$/i, "");
  }
  if (hasExt(base)) return base;

  // Déterminer extension
  let ext = extFromPath(urlPath);
  if (!ext && contentType) ext = extFromContentType(contentType);
  return ext ? `${base}.${ext}` : base;
}

/* ---------------- URL helpers ---------------- */
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

/* ---------------- streaming ---------------- */
async function streamToClient(urlObj, res, requestedName) {
  const upstream = await fetch(urlObj.toString(), { redirect: "follow" });
  if (!upstream.ok) return { ok: false, status: upstream.status };

  const ct = upstream.headers.get("content-type") || "application/octet-stream";
  const cdUp = upstream.headers.get("content-disposition") || "";
  const upstreamName = parseUpstreamFilename(cdUp);

  const finalNameNoAscii = ensureNameWithExt({
    desiredName: requestedName,
    urlPath: urlObj.pathname,
    contentType: ct,
    upstreamFilename: upstreamName,
  }) || "file";

  // Content-Disposition robuste (ASCII + UTF-8)
  const asciiName = finalNameNoAscii.replace(/[^\x20-\x7E]+/g, "_");
  const utf8Name = encodeURIComponent(finalNameNoAscii).replace(/'/g, "%27");

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

/* ---------------- route ---------------- */
/**
 * GET /api/download?url=<cloudinaryUrl>&filename=<nom (optionnel, avec ou sans extension)>
 * - Récupère le flux Cloudinary
 * - Extrait le nom depuis Content-Disposition amont si dispo, sinon param/URL
 * - Garantit une extension (Content-Type, chemin ou upstream)
 * - Fallback fl_attachment puis redirect si nécessaire
 */
router.get("/download", async (req, res) => {
  const rawUrl = req.query?.url;
  const requestedName = cleanName(req.query?.filename); // peut être vide

  if (!rawUrl) return res.status(400).json({ ok: false, error: "Missing url param" });

  let target;
  try { target = new URL(rawUrl); }
  catch { return res.status(400).json({ ok: false, error: "Invalid url param" }); }

  // Cloudinary seulement (souple: *.cloudinary.com)
  const host = (target.hostname || "").toLowerCase();
  const isCloudinary = host.endsWith(".cloudinary.com");
  if (!isCloudinary) {
    // ne bloque pas : redirect (Cloudinary ou autre)
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

    // C) redirect 302 (Cloudinary honorera souvent le ?dl + fl_attachment)
    return res.redirect(302, B.toString());
  } catch {
    // Ultime fallback
    return res.redirect(302, withDl(target, requestedName).toString());
  }
});

export default router;
