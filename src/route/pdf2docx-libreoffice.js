// server/src/route/pdf2docx-libreoffice.js
import express from "express";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

const router = express.Router();

/* ---------- Config upload ---------- */
// Limite taille (Mo) configurable via .env : MAX_PDF_MB=12 (défaut 12)
const MAX_MB = Number(process.env.MAX_PDF_MB || 12);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

const TMP_DIR = "/tmp";

/* ---------- Détection binaire LibreOffice ---------- */
async function detectSofficeBin() {
  const candidates = ["/usr/bin/soffice", "soffice", "libreoffice"];
  for (const bin of candidates) {
    try {
      await new Promise((resolve, reject) => {
        const p = spawn(bin, ["--version"], { env: { ...process.env, HOME: "/tmp" } });
        let seen = false;
        p.stdout.on("data", () => (seen = true));
        p.on("error", reject);
        p.on("close", (code) => (seen && code === 0 ? resolve() : reject(new Error("no output"))));
      });
      return bin;
    } catch { /* try next */ }
  }
  return null;
}

/* ---------- Route principale: PDF -> DOCX ---------- */
router.post("/convert/pdf-to-word", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier" });

    const name = req.file.originalname || "document.pdf";
    if (!/\.pdf$/i.test(name)) {
      return res.status(400).json({ error: "Le fichier doit être un PDF" });
    }

    // Garde-fou taille (UX propre)
    if (req.file.size > MAX_MB * 1024 * 1024) {
      return res.status(413).json({
        error: "PDF trop volumineux pour le plan actuel",
        maxMB: MAX_MB,
        hint: "Réduisez la taille du PDF ou augmentez la mémoire du serveur.",
      });
    }

    const bin = await detectSofficeBin();
    if (!bin) {
      return res.status(500).json({
        error: "LibreOffice introuvable (soffice). Déployez en Docker avec libreoffice installé.",
      });
    }

    const id = randomUUID();
    const inPath = path.join(TMP_DIR, `${id}.pdf`);
    const outPath = path.join(TMP_DIR, `${id}.docx`);
    const profileDir = path.join(TMP_DIR, `lo-profile-${id}`);

    await fs.writeFile(inPath, req.file.buffer);
    await fs.mkdir(profileDir, { recursive: true });

    // Profil isolé pour éviter les verrous/profils corrompus
    const userInstallation = `-env:UserInstallation=file://${profileDir.replace(/\\/g, "/")}`;

    const args = [
      "--headless",
      "--nologo",
      "--norestore",
      "--nodefault",
      "--nolockcheck",
      "--nocrashreport",
      userInstallation,
      "--convert-to", "docx:MS Word 2007 XML",
      "--outdir", TMP_DIR,
      inPath,
    ];

    // Lancer LibreOffice (HOME=/tmp)
    const child = spawn(bin, args, { env: { ...process.env, HOME: "/tmp" } });

    let stdout = "", stderr = "";
    child.stdout.on("data", d => (stdout += d.toString()));
    child.stderr.on("data", d => (stderr += d.toString()));

    // ---- FLAG pour savoir QUI a tué le process ----
    let killedByTimeout = false;
    const KILL_AFTER_MS = Number(process.env.PDF2DOCX_TIMEOUT_MS || 300_000); // 5 min par défaut
    const killer = setTimeout(() => {
      killedByTimeout = true;              // <-- FLAG activé si on coupe nous-mêmes (timeout)
      try { child.kill("SIGKILL"); } catch {}
    }, KILL_AFTER_MS);

    child.on("error", async (err) => {
      clearTimeout(killer);
      await safeCleanup([inPath, outPath, profileDir]);
      return res.status(500).json({
        error: "Conversion failed (spawn error)",
        details: String(err),
      });
    });

    child.on("close", async (code, signal) => {
      clearTimeout(killer);
      try {
        if (signal) {
          // Interruption par signal (SIGKILL, SIGTERM...)
          // - killedByTimeout === true => c'est notre timeout
          // - killedByTimeout === false => probablement OOM/plateforme
          await safeCleanup([inPath, outPath, profileDir]);
          return res.status(500).json({
            error: "LibreOffice interrompu",
            signal,
            killedByTimeout,
            stdout,
            stderr,
          });
        }
        if (code !== 0) {
          await safeCleanup([inPath, outPath, profileDir]);
          return res.status(500).json({
            error: `LibreOffice exit ${code}`,
            stdout,
            stderr,
          });
        }

        // OK : renvoyer le DOCX
        const buf = await fs.readFile(outPath);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        const base = name.replace(/\.pdf$/i, "");
        res.setHeader("Content-Disposition", `attachment; filename="${base}.docx"`);
        res.send(buf);
      } catch (e) {
        return res.status(500).json({ error: "Readback failed", details: String(e), stdout, stderr });
      } finally {
        await safeCleanup([inPath, outPath, profileDir]);
      }
    });
  } catch (e) {
    return res.status(500).json({ error: "Erreur serveur", details: String(e) });
  }
});

/* ---------- util ---------- */
async function safeCleanup(paths) {
  for (const p of paths) {
    try { await fs.rm(p, { force: true, recursive: true }); } catch {}
  }
}

/* ---------- debug ---------- */
router.get("/debug/soffice", (req, res) => {
  const child = spawn("/usr/bin/soffice", ["--version"], { env: { ...process.env, HOME: "/tmp" } });
  let out = "", err = "";
  child.stdout.on("data", d => out += d.toString());
  child.stderr.on("data", d => err += d.toString());
  child.on("close", code => {
    res.status(code === 0 ? 200 : 500).send(out || err || `exit ${code}`);
  });
});

export default router;
