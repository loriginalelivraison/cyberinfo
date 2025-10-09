// src/lib/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// ── Charger le .env ici (avant cloudinary.config), même si tu lances depuis /src
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// remonte à la racine du dossier server : server/.env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ── Maintenant seulement on configure Cloudinary avec des env garanties
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Petit log utile en dev (tronqué)
if (process.env.NODE_ENV !== "production") {
  const keyPeek = (process.env.CLOUDINARY_API_KEY || "").slice(0, 4);
  console.log("[cloudinary] config", {
    CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
    API_KEY: keyPeek ? `${keyPeek}***` : false,
    API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
  });
}

export default cloudinary;
