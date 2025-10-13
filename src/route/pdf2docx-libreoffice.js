import express from "express";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 Mo (ajuste si besoin)
});

const TMP_DIR = "/tmp";

async function detectSofficeBin() {
  const bins = ["/usr/bin/soffice", "soffice", "libreoffice"];
  for (const b of bins) {
    try {
      await new Promise((resolve, reject) => {
        const p = spawn(b, ["--version"], { env: { ...process.env, HOME: "/tmp" } });
        let seen = false;
        p.stdout.on("data", () => (seen = true));
        p.on("error", reject);
        p.on("close", (code) => (seen && code === 0 ? resolve() : reject(new Error("no output"))));
      });
      return b;
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
      return res.status(500).json({ error: "LibreOffice introuvable (soffice). Déploie avec Dockerfile incluant libreoffice." });
    }

    const id = randomUUID();
    const inPath = path.join(TMP_DIR, `${id}.pdf`);
    const outPath = path.join(TMP_DIR, `${id}.docx`);
    const profileDir = path.join(TMP_DIR, `lo-profile-${id}`);

    await fs.writeFile(inPath, req.file.buffer);
    await fs.mkdir(profileDir, { recursive: true });

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

    // Timeout plus large (5 min) + HOME=/tmp pour éviter les locks
    const child = spawn(bin, args, {
      env: { ...process.env, HOME: "/tmp" },
    });

    let stdout = "", stderr = "";
    child.stdout.on("data", d => (stdout += d.toString()));
    child.stderr.on("data", d => (stderr += d.toString()));

    const KILL_AFTER_MS = 300_000; // 5 minutes
    const killer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
    }, KILL_AFTER_MS);

    child.on("error", async (err) => {
      clearTimeout(killer);
      await safeCleanup([inPath, outPath, profileDir]);
      return res.status(500).json({ error: "Conversion failed (spawn error)", details: String(err) });
    });

    child.on("close", async (code, signal) => {
      clearTimeout(killer);
      try {
        if (signal) {
          await safeCleanup([inPath, outPath, profileDir]);
          return res.status(500).json({ error: "LibreOffice interrompu", signal, stdout, stderr });
        }
        if (code !== 0) {
          await safeCleanup([inPath, outPath, profileDir]);
          return res.status(500).json({ error: `LibreOffice exit ${code}`, stdout, stderr });
        }
        const buf = await fs.readFile(outPath);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        const base = (req.file.originalname || "document.pdf").replace(/\.pdf$/i, "");
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

async function safeCleanup(paths) {
  for (const p of paths) {
    try {
      await fs.rm(p, { force: true, recursive: true });
    } catch {}
  }
}

// Debug: version de soffice
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
