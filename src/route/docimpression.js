// src/route/docimpression.js
import express from "express";
import DocImpression from "../models/docimpression.js";
import cloudinary from "../cloudinary.js";

const router = express.Router();

/* util: normaliser un item file venant du front */
function normalizeFile(f = {}) {
  return {
    url: f.url || f.secure_url || null,
    public_id: f.public_id || null,
    format: f.format || null,
    bytes: typeof f.bytes === "number" ? f.bytes : undefined,
    resource_type: f.resource_type || "raw",
    original_filename: f.original_filename || f.originalname || null,
    createdAt: f.createdAt || undefined,
  };
}

/* GET liste */
router.get("/docimpression", async (_req, res) => {
  try {
    const list = await DocImpression.find().sort({ createdAt: -1 }).lean();
    return res.json(list);
  } catch (e) {
    console.error("[docimpression][GET] ERROR:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* POST créer un groupe (name + files[]) */
router.post("/docimpression", async (req, res) => {
  try {
    const { name, note, files } = req.body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ ok: false, error: "Paramètre 'name' requis" });
    }
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ ok: false, error: "Paramètre 'files' (array) requis" });
    }

    // normaliser + valider les fichiers
    const mapped = files.map(normalizeFile);
    const invalids = [];
    const valids = [];

    for (const f of mapped) {
      if (!f.url) {
        invalids.push({ reason: "url manquante", file: f });
        continue;
      }
      // petite sanitation
      if (!["image", "video", "raw", "file", "auto"].includes(f.resource_type)) {
        f.resource_type = "raw";
      }
      valids.push(f);
    }

    if (valids.length === 0) {
      console.warn("[docimpression][POST] aucun fichier valide", { invalids: invalids.length });
      return res.status(400).json({
        ok: false,
        error: "Aucun fichier valide: chaque item doit contenir au minimum { url }",
        details: invalids.slice(0, 3), // on n’affiche que quelques exemples
      });
    }

    // log utile (tu verras si une vidéo manque un champ)
    console.log("[docimpression][POST]", {
      name: name.trim(),
      files_total: files.length,
      files_valids: valids.length,
      files_invalids: invalids.length,
      sample: {
        first_valid: valids[0],
      },
    });

    const doc = await DocImpression.create({
      name: name.trim(),
      note: note ? String(note) : undefined,
      files: valids,
    });

    return res.json({ ok: true, id: doc._id, invalids: invalids.length });
  } catch (e) {
    // On renvoie l’erreur Mongoose/validation de manière lisible
    console.error("[docimpression][POST] ERROR:", e?.message, e?.errors || "");
    if (e?.name === "ValidationError") {
      return res.status(400).json({ ok: false, error: "ValidationError", details: e.errors });
    }
    return res.status(500).json({ ok: false, error: e.message || "Erreur serveur" });
  }
});

/* DELETE un fichier précis (par public_id OU url) */
router.delete("/docimpression/file", async (req, res) => {
  try {
    const { public_id, url } = req.query;
    if (!public_id && !url) {
      return res.status(400).json({ ok: false, error: "public_id or url required" });
    }

    // supprimer sur Cloudinary si on a l'identifiant
    if (public_id) {
      try {
        await cloudinary.uploader.destroy(public_id, { resource_type: "auto" });
      } catch (err) {
        // on n’échoue pas si la suppression Cloudinary échoue (on nettoie quand même en BDD)
        console.warn("[docimpression][DELETE] cloudinary destroy warn:", err?.message);
      }
    }

    // supprimer en BDD
    const q = public_id ? { "files.public_id": public_id } : { "files.url": url };
    const u = { $pull: { files: public_id ? { public_id } : { url } } };
    const updated = await DocImpression.updateMany(q, u);

    return res.json({ ok: true, updated });
  } catch (e) {
    console.error("[docimpression][DELETE] ERROR:", e?.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
