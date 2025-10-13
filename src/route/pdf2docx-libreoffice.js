import express from "express";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

const router = express.Router();

// 25 Mo max par fichier (à ajuster selon ton plan)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const TMP_DIR = "/tmp"; // obligatoire sur Render/Heroku

router.post("/convert/pdf-to-word", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier" });
    if (!/\.pdf$/i.test(req.file.originalname)) {
      return res.status(400).json({ error: "Le fichier doit être un PDF" });
    }

    const id = randomUUID();
    const inPath = path.join(TMP_DIR, `${id}.pdf`);
    const outPath = path.join(TMP_DIR, `${id}.docx`);

    await fs.writeFile(inPath, req.file.buffer);

    const args = [
      "--headless",
      "--nologo",
      "--norestore",
      "--invisible",
      "--convert-to", "docx:MS Word 2007 XML",
      "--outdir", TMP_DIR,
      inPath,
    ];

    const child = spawn("soffice", args, { stdio: "ignore" });

    // Sécurité anti-timeout proxy (~100s Render) → on coupe à 60s
    const KILL_AFTER_MS = 60_000;
    const killer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
    }, KILL_AFTER_MS);

    child.on("error", async (err) => {
      clearTimeout(killer);
      await fs.rm(inPath, { force: true });
      return res.status(500).json({ error: "Conversion failed (spawn)", details: String(err) });
    });

    child.on("close", async (code) => {
      clearTimeout(killer);
      try {
        if (code !== 0) {
          await fs.rm(inPath, { force: true });
          return res.status(500).json({ error: `LibreOffice exit ${code}` });
        }
        const docx = await fs.readFile(outPath);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        const base = req.file.originalname.replace(/\.pdf$/i, "");
        res.setHeader("Content-Disposition", `attachment; filename="${base}.docx"`);
        res.send(docx);
      } finally {
        await Promise.all([
          fs.rm(inPath, { force: true }),
          fs.rm(outPath, { force: true }),
        ]);
      }
    });
  } catch (e) {
    return res.status(500).json({ error: "Erreur serveur", details: String(e) });
  }
});

// Debug: vérifier que LibreOffice est présent
router.get("/debug/soffice", (req, res) => {
  const child = spawn("soffice", ["--version"]);
  let out = "", err = "";
  child.stdout.on("data", d => out += d.toString());
  child.stderr.on("data", d => err += d.toString());
  child.on("close", code => res
    .status(code === 0 ? 200 : 500)
    .send(out || err || `exit ${code}`));
});

export default router;