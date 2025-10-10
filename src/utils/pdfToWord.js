import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convertit un fichier PDF en DOCX via LibreOffice.
 * @param {string} inputPath Chemin complet du fichier PDF source
 * @param {string} outputDir Dossier où créer le DOCX
 * @returns {Promise<string>} Chemin du DOCX généré
 */
export function convertPdfToWord(inputPath, outputDir = path.join(__dirname, "../../tmp")) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) return reject(new Error("Fichier PDF introuvable"));

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const cmd = `soffice --headless --convert-to docx "${inputPath}" --outdir "${outputDir}"`;

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("[PDF→Word] erreur:", stderr || error.message);
        return reject(new Error("Erreur de conversion PDF→Word"));
      }

      const base = path.basename(inputPath, path.extname(inputPath));
      const outputPath = path.join(outputDir, `${base}.docx`);
      if (!fs.existsSync(outputPath)) return reject(new Error("DOCX non généré"));
      resolve(outputPath);
    });
  });
}
