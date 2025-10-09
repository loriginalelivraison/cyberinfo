// server/src/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Charge .env depuis la racine du dossier server (un niveau au-dessus de src)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Configure Cloudinary depuis les variables d'environnement
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Log utile en dev
console.log("[cloudinary] effective config", {
  CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "(missing)",
  API_KEY: process.env.CLOUDINARY_API_KEY ? "✔︎" : "(missing)",
  API_SECRET: process.env.CLOUDINARY_API_SECRET ? "✔︎" : "(missing)",
  SECURE: true,
});

// Validation dure (évite les 500 plus loin si mal configuré)
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  throw new Error("Cloudinary config missing: api_key/cloud_name/api_secret. Vérifie server/.env");
}

export default cloudinary;
