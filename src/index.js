// src/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./lib/db.js";
import proxyRoutes from "./route/proxy.js"; // ⬅️ AJOUT (déjà importé chez toi)
import aadlRoutes from "./route/aadl.js";
import aadldemande from "./route/addldemande.js";
import docimpressionRoutes from "./route/docimpression.js";
import uploadRoutes from "./route/upload.js";

import pdf2docxWordRoutes from "./route/pdf2docx-word.js";



// --- Résout le chemin du .env même si tu lances depuis /src ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// .env situé à la racine du dossier server (un niveau au-dessus de src)
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();

// ---------- middlewares ----------
app.use(express.json({ limit: "25mb" }));

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use((req, res, next) => { res.setHeader("Vary", "Origin"); next(); });


const ALLOWED = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use((req, res, next) => { res.setHeader("Vary", "Origin"); next(); });

app.use(cors({
  origin(origin, cb) {
    // Pas d'en-tête Origin => Postman, cURL, browser direct: autoriser
    if (!origin) return cb(null, true);

    // Autoriser ton/tes domaines exacts listés dans CORS_ORIGIN
    if (ALLOWED.includes(origin)) return cb(null, true);

    // Autoriser toutes les préviews Vercel: https://<any>-<proj>-<user>.vercel.app
    try {
      const { hostname } = new URL(origin);
      if (hostname.endsWith(".vercel.app")) return cb(null, true);
    } catch { /* ignore */ }

    return cb(new Error("CORS blocked: " + origin));
  },
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
}));

app.options("*", cors());

// ---------- DB ----------
if (!process.env.MONGODB_URI) {
  console.error("[BOOT] MONGODB_URI missing in .env (loaded from ../.env)");
  process.exit(1);
}
await connectDB(process.env.MONGODB_URI);

// ---------- health ----------
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// (Optionnel dev) servir des fichiers locaux si tu en gardes:
app.use("/api/uploads", express.static(path.resolve("uploads")));

// ---------- API ----------
// ✅ MONTE LE PROXY DE TÉLÉCHARGEMENT (une seule ligne ajoutée)
app.use("/api", proxyRoutes);

// IMPORTANT: on monte uploadRoutes sur "/api" (pas "/api/upload"),
// car les chemins internes commencent par "/upload/..."
app.use("/api", uploadRoutes);
app.use("/api", docimpressionRoutes);

// tes autres routes métiers
app.use("/api/", aadlRoutes);
app.use("/api/aadl", aadldemande);




app.use("/api", pdf2docxWordRoutes);
// ---------- boot ----------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[HTTP] http://localhost:${PORT}`);
  // Petit check utile en dev (tronqué) :
  const keyPeek = (process.env.CLOUDINARY_API_KEY || "").slice(0, 4);
  console.log("[ENV] Cloudinary loaded:",
    {
      CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
      API_KEY: keyPeek ? `${keyPeek}***` : false,
      API_SECRET: !!process.env.CLOUDINARY_API_SECRET
    }
  );
});
