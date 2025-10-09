import express from "express";
import DocImpression from "../models/docimpression.js";
import cloudinary from "../cloudinary.js";

const router = express.Router();

// Liste
router.get("/docimpression", async (_req, res) => {
  try {
    const list = await DocImpression.find().sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Ajouter
router.post("/docimpression", async (req, res) => {
  try {
    const { name, note, files } = req.body || {};
    if (!name || !Array.isArray(files) || files.length === 0)
      return res.status(400).json({ ok: false, error: "name + files required" });

    const doc = await DocImpression.create({
      name: String(name).trim(),
      note,
      files: files.map(f => ({
        url: f.url,
        public_id: f.public_id,
        format: f.format,
        bytes: f.bytes,
        resource_type: f.resource_type,
        original_filename: f.original_filename,
      })),
    });

    res.json({ ok: true, id: doc._id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Supprimer un fichier
router.delete("/docimpression/file", async (req, res) => {
  try {
    const { public_id, url } = req.query;
    if (!public_id && !url)
      return res.status(400).json({ ok: false, error: "public_id or url required" });

    if (public_id) {
      await cloudinary.uploader.destroy(public_id, { resource_type: "auto" }).catch(() => {});
    }

    const q = public_id ? { "files.public_id": public_id } : { "files.url": url };
    const u = { $pull: { files: public_id ? { public_id } : { url } } };
    const updated = await DocImpression.updateMany(q, u);

    res.json({ ok: true, updated });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
