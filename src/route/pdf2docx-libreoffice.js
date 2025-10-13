import express from "express";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

const router = express.Router();

// Mémoire (Render/Heroku) + limite 25 Mo (ajuste si tu veux)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const TMP_DIR = "/tmp";

// Détecte binaire LibreOffice (chemin absolu recommandé en prod Linux)
async function detectSofficeBin() {
  const candidates = ["/usr/bin/soffice", "soffice", "libreoffice"];
  for (const c of candidates) {
    try {
      await new Promise((resolve, reject) => {
        const p = spawn(c, ["--version"], { env: { ...process.env, HOME: "/tmp" } });
        let ok = false;
        p.stdout.on("data", () => (ok = true));
        p.stderr.on("data", () => {}); // ignore
        p.on("error", reject);
        p.on("close", () => (ok ? resolve() : reject(new Error("no output"))));
      });
      return c;
    } catch {}
  }
  return null;
}

router.post("/convert/pdf-to-word", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier" });
    if (!/\.pdf$/i.test(req.file.originalname || "")) {
      return res.status(400).json({ error: "Le fichier doit être un PDF" });
    }

    const bin = await detectSofficeBin();
    if (!bin) {
      return res.status(500).json({ error: "LibreOffice introuvable (soffice). Déploie avec Dockerfile ou installe libreoffice." });
    }

    const id = randomUUID();
    const inPath = path.join(TMP_DIR, `${id}.pdf`);
    const outPath = path.join(TMP_DIR, `${id}.docx`);
    await fs.writeFile(inPath, req.file.buffer);

    // Arguments robustes
    const args = [
      "--headless",
      "--nologo",
      "--norestore",
      "--nodefault",
      "--invisible",
      // filtre DOCX
      "--convert-to", "docx:MS Word 2007 XML",
      "--outdir", TMP_DIR,
      inPath,
    ];

    // ↑ Render : HOME=/tmp évite les locks de profil
    const child = spawn(bin, args, {
      env: { ...process.env, HOME: "/tmp" },
    });

    let stdout = "", stderr = "";
    child.stdout.on("data", d => (stdout += d.toString()));
    child.stderr.on("data", d => (stderr += d.toString()));

    const KILL_AFTER_MS = 180_000; // 180 s
    const killer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
    }, KILL_AFTER_MS);

    child.on("error", async (err) => {
      clearTimeout(killer);
      await fs.rm(inPath, { force: true });
      return res.status(500).json({
        error: "Conversion failed (spawn error)",
        details: String(err),
      });
    });

    child.on("close", async (code, signal) => {
      clearTimeout(killer);
      try {
        if (signal) {
          // tué par timeout ou autre signal
          await fs.rm(inPath, { force: true });
          return res.status(500).json({
            error: "LibreOffice interrompu",
            signal,
            stdout,
            stderr,
          });
        }
        if (code !== 0) {
          await fs.rm(inPath, { force: true });
          return res.status(500).json({
            error: `LibreOffice exit ${code}`,
            stdout,
            stderr,
          });
        }
        // OK
        const buf = await fs.readFile(outPath);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        const base = (req.file.originalname || "document.pdf").replace(/\.pdf$/i, "");
        res.setHeader("Content-Disposition", `attachment; filename="${base}.docx"`);
        res.send(buf);
      } catch (e) {
        return res.status(500).json({ error: "Readback failed", details: String(e), stdout, stderr });
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

// Debug: version de soffice (utile en prod)
router.get("/debug/soffice", (req, res) => {
  const child = spawn("/usr/bin/soffice", ["--version"], { env: { ...process.env, HOME: "/tmp" } });
  let out = "", err = "";
  child.stdout.on("data", d => out += d.toString());
  child.stderr.on("data", d => err += d.toString());
  child.on("close", code =>
    res.status(code === 0 ? 200 : 500).send(out || err || `exit ${code}`)
  );
});

export default router;
