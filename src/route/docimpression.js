// route/docimpression.js
import express from "express";
import DocImpression from "../models/docimpression.js";
import cloudinary from "./cloudinary.js";

const router = express.Router();

// GET liste
router.get("/docimpression", async (_req, res) => {
  try {
    const list = await DocImpression.find().sort({ createdAt: -1 }).lean();
    return res.json(list);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST créer un groupe (name + files[])
router.post("/docimpression", async (req, res) => {
  try {
    const { name, note, files } = req.body || {};
    if (!name || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ ok: false, error: "name + files required" });
    }
    const doc = await DocImpression.create({
      name: String(name).trim(),
      note: note ? String(note) : undefined,
      files: files.map(f => ({
        url: f.url,
        public_id: f.public_id || null,
        format: f.format,
        bytes: f.bytes,
        resource_type: f.resource_type || "raw",
        original_filename: f.original_filename,
      })),
    });
    return res.json({ ok: true, id: doc._id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE un fichier précis (par public_id OU url)
router.delete("/docimpression/file", async (req, res) => {
  try {
    const { public_id, url } = req.query;
    if (!public_id && !url) return res.status(400).json({ ok: false, error: "public_id or url required" });

    // 1) Supprime sur Cloudinary si public_id
    if (public_id) {
      await cloudinary.uploader.destroy(public_id, { resource_type: "auto" }).catch(() => {});
    }

    // 2) Supprime en BDD
    const q = public_id ? { "files.public_id": public_id } : { "files.url": url };
    const u = { $pull: { files: public_id ? { public_id } : { url } } };
    const updated = await DocImpression.updateMany(q, u);

    return res.json({ ok: true, updated });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
