// server/src/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./lib/db.js";

import proxyRoutes from "./route/proxy.js";
import aadlRoutes from "./route/aadl.js";
import aadldemande from "./route/addldemande.js";
import docimpressionRoutes from "./route/docimpression.js";
import uploadRoutes from "./route/upload.js";

import pdf2docxLibreRoutes from "./route/pdf2docx-libreoffice.js";
import pdf2docxWordRoutes from "./route/pdf2docx-word.js"; // Windows-only

// ----- .env -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();

// ---------- middlewares ----------
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

// CORS: domaines autorisés via CORS_ORIGIN="https://monsite.com,https://app.vercel.app"
const ALLOWED = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use((req, res, next) => { res.setHeader("Vary", "Origin"); next(); });

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // Postman/cURL
    if (ALLOWED.includes(origin)) return cb(null, true);

    // Autoriser toutes les préviews Vercel
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

// (Optionnel) servir des fichiers locaux si tu en gardes:
app.use("/api/uploads", express.static(path.resolve("uploads")));

// ---------- API métiers ----------
app.use("/api", proxyRoutes);
app.use("/api", uploadRoutes);
app.use("/api", docimpressionRoutes);
app.use("/api/", aadlRoutes);
app.use("/api/aadl", aadldemande);

// ---------- Conversion PDF -> DOCX (OS switch) ----------
const IS_WINDOWS = process.platform === "win32";
console.log("[ENV] OS:", IS_WINDOWS ? "Windows" : "Linux");

if (IS_WINDOWS) {
  console.log("[MODE] Windows/Word COM (route: /api/convert/pdf-to-word/word)");
  app.use("/api", pdf2docxWordRoutes);
} else {
  console.log("[MODE] Linux/LibreOffice (route: /api/convert/pdf-to-word)");
  app.use("/api", pdf2docxLibreRoutes);
}

/* --- Alias robustes : les deux chemins existent toujours --- */
// Ainsi, même si le front appelle le mauvais chemin, pas de 404.
if (IS_WINDOWS) {
  // Permet aussi /api/convert/pdf-to-word sous Windows (redirige vers /word)
  app.use("/api/convert/pdf-to-word", (req, res, next) => {
    req.url = "/convert/pdf-to-word/word";
    pdf2docxWordRoutes(req, res, next);
  });
} else {
  // Permet aussi /api/convert/pdf-to-word/word sous Linux (redirige vers /)
  app.use("/api/convert/pdf-to-word/word", (req, res, next) => {
    req.url = "/convert/pdf-to-word";
    pdf2docxLibreRoutes(req, res, next);
  });
}

// ---------- boot ----------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[HTTP] http://localhost:${PORT}`);
  const keyPeek = (process.env.CLOUDINARY_API_KEY || "").slice(0, 4);
  console.log("[ENV] Cloudinary loaded:",
    {
      CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
      API_KEY: keyPeek ? `${keyPeek}***` : false,
      API_SECRET: !!process.env.CLOUDINARY_API_SECRET
    }
  );
});
