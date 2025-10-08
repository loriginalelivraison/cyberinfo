import express from "express";
import path from "path";
import fs from "fs";
import DocImpression from "../models/docimpression.js";
import cloudinary from "cloudinary";

const router = express.Router();

// (optionnel) config cloudinary si présent en .env
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Helpers ------------------------------------------------------------
function isLocalUploadsUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.startsWith("/uploads/");
  } catch {
    return false;
  }
}

function localPathFromUploadsUrl(url) {
  const uploadsRoot = path.resolve("uploads");
  try {
    const u = new URL(url);
    const rel = u.pathname.replace(/^\/uploads\/+/, ""); // pdfs/..., images/..., videos/..., files/...
    const p = path.resolve(uploadsRoot, rel);
    // sécurité: rester dans /uploads
    if (!p.startsWith(uploadsRoot)) return null;
    return p;
  } catch {
    return null;
  }
}

// Routes -------------------------------------------------------------

// POST /docimpression → enregistre dans MongoDB
router.post("/docimpression", async (req, res) => {
  try {
    const { name, files } = req.body;

    if (!name || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ ok: false, error: "Champs manquants" });
    }

    const doc = await DocImpression.create({
      name: name.trim(),
      files,
    });

    res.json({ ok: true, id: doc._id });
  } catch (err) {
    console.error("[/docimpression] error:", err);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

// GET /docimpression → list
router.get("/docimpression", async (_req, res) => {
  const docs = await DocImpression.find().sort({ createdAt: -1 });
  res.json(docs);
});

// DELETE /docimpression/file?url=<encodedURL>
// ou body: { url: "<url>" }
router.delete("/docimpression/file", async (req, res) => {
  try {
    const fileUrl = (req.query.url || req.body?.url || "").trim();
    if (!fileUrl) return res.status(400).json({ ok: false, error: "Paramètre url manquant" });

    // 1) retrouver l'entrée dans la BDD
    let doc = await DocImpression.findOne({ "files.url": fileUrl });
    if (!doc) {
      // fallback si certains enregistrements ont secure_url
      doc = await DocImpression.findOne({ "files.secure_url": fileUrl });
    }
    if (!doc) return res.status(404).json({ ok: false, error: "Fichier non trouvé en base" });

    const idx = doc.files.findIndex(
      (f) => f.url === fileUrl || f.secure_url === fileUrl
    );
    if (idx === -1) return res.status(404).json({ ok: false, error: "Fichier introuvable dans le document" });

    const file = doc.files[idx];

    // 2) suppression physique
    let localDeleted = false;
    let cloudDeleted = null;

    if (isLocalUploadsUrl(fileUrl)) {
      const p = localPathFromUploadsUrl(fileUrl);
      if (p && fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          localDeleted = true;
        } catch (e) {
          console.warn("[unlink] échec:", e.message);
        }
      }
    } else if ((file.public_id || "").length && (fileUrl.includes("res.cloudinary.com"))) {
      // supprimer sur Cloudinary si dispo et configuré
      try {
        const rt = file.resource_type || "image"; // "image" | "video" | "raw" | "file"
        const result = await cloudinary.v2.uploader.destroy(file.public_id, {
          resource_type: ["image", "video", "raw"].includes(rt) ? rt : "image",
          invalidate: true,
        });
        cloudDeleted = result;
      } catch (e) {
        console.warn("[cloudinary.destroy] échec:", e.message);
      }
    }

    // 3) suppression en base
    doc.files.splice(idx, 1);
    await doc.save();

    // (option) si plus aucun fichier, tu peux supprimer le groupe
    // if (doc.files.length === 0) await DocImpression.deleteOne({ _id: doc._id });

    return res.json({ ok: true, localDeleted, cloudDeleted, remaining: doc.files.length });
  } catch (err) {
    console.error("[DELETE /docimpression/file] error:", err);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

export default router;
