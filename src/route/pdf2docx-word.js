import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = path.resolve(process.cwd(), "uploads/pdfs");
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-()+\s]/g, "_");
    cb(null, safe);
  },
});
const upload = multer({ storage });

router.post("/convert/pdf-to-word/word", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier" });

    const inputAbs = path.resolve(req.file.path);
    const outDir = path.resolve(process.cwd(), "uploads/word");
    fs.mkdirSync(outDir, { recursive: true });

    const base = path.basename(inputAbs, path.extname(inputAbs));
    const outDocx = path.join(outDir, `${base}.docx`);

    const script = path.resolve(process.cwd(), "scripts/pdf2docx.ps1");
    const args = [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", script,
      "-InputPdf", inputAbs,
      "-OutputDocx", outDocx,
    ];

    const child = spawn("powershell.exe", args, { windowsHide: true });
    let stderr = "", stdout = "";
    child.stdout.on("data", d => (stdout += d.toString()));
    child.stderr.on("data", d => (stderr += d.toString()));

    child.on("close", code => {
      if (code === 0 && fs.existsSync(outDocx)) {
        return res.download(outDocx, path.basename(outDocx));
      }
      console.error("[WORD stderr]", stderr);
      return res.status(500).json({ error: "Conversion Word échouée", details: stderr || stdout || `exit ${code}` });
    });
  } catch (err) {
    console.error("[/convert/pdf-to-word/word] err:", err);
    res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
});

export default router;
