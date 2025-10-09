// src/route/proxy.js
import express from "express";
import { URL } from "url";

const router = express.Router();

function cleanName(name) {
  return (name || "").replace(/[\\\/]+/g, " ").trim() || "file";
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
async function streamToClient(urlObj, res, filename) {
  const up = await fetch(urlObj.toString(), { redirect: "follow" });
  if (!up.ok) return { ok: false, status: up.status };

  const ct = up.headers.get("content-type") || "application/octet-stream";
  res.setHeader("Content-Type", ct);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");

  if (!up.body) return { ok: false, status: 500, reason: "no body" };
  up.body.pipe(res);
  return { ok: true };
}

/**
 * GET /api/download?url=<cloudinaryUrl>&filename=<nom.ext>
 * - Plan A : stream l’URL + ?dl= (on force le download côté serveur)
 * - Plan B : ré-essai en insérant fl_attachment:<nom> dans le path + ?dl=
 * - Plan C : redirection 302 vers Cloudinary si l’amont refuse (401/403/…)
 */
router.get("/download", async (req, res) => {
  const rawUrl = req.query?.url;
  const filename = cleanName(req.query?.filename);

  if (!rawUrl) return res.status(400).json({ ok: false, error: "Missing url param" });

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid url param" });
  }

  // on accepte *.cloudinary.com (ex: res.cloudinary.com)
  const host = (target.hostname || "").toLowerCase();
  const isCloudinary = host.endsWith(".cloudinary.com");
  if (!isCloudinary) {
    // ne bloque pas l'utilisateur : redirection directe
    return res.redirect(302, withDl(target, filename).toString());
  }

  try {
    // A) stream avec ?dl=
    const A = withDl(target, filename);
    const a = await streamToClient(A, res, filename);
    if (a.ok) return;

    // B) stream avec fl_attachment + ?dl=
    const B = withDl(withFlAttachment(target, filename), filename);
    const b = await streamToClient(B, res, filename);
    if (b.ok) return;

    // C) redirect 302 vers Cloudinary (fl_attachment + ?dl)
    return res.redirect(302, B.toString());
  } catch (e) {
    // fallback final : redirect simple
    return res.redirect(302, withDl(target, filename).toString());
  }
});

export default router;
