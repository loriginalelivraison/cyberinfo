// src/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import path from "path";

import connectDB from "./lib/db.js";

import aadlRoutes from "./route/aadl.js";
import aadldemande from "./route/addldemande.js";
import cloudinaryRoutes from "./route/cloudinary.js";
import docimpressionRoutes from "./route/docimpression.js";
import uploadRoutes from "./route/upload.js";

const app = express();

// ---------- middlewares de base ----------
app.use(express.json());
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use((req, res, next) => { res.setHeader("Vary", "Origin"); next(); });

app.use(cors({
  origin(origin, cb) {
    // autoriser Postman/cURL (origin = undefined)
    if (!origin) return cb(null, true);
    // si aucune liste => tout autoriser (à éviter en prod)
    if (ALLOWED_ORIGINS.length === 0) return cb(null, true);
    // vérifier la liste
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.options("*", cors());

// ---------- DB ----------
if (!process.env.MONGODB_URI) {
  console.error("[BOOT] MONGODB_URI missing in .env");
  process.exit(1);
}
connectDB(process.env.MONGODB_URI)
  .then(() => console.log("CONNECTEE A LA BD CYBERINFO"))
  .catch((err) => {
    console.error("[BOOT] DB connection failed:", err.message);
    process.exit(1);
  });

// ---------- health ----------
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ---------- fichiers statiques (pour OUVRIR pdf/vidéos) ----------
app.use("/api/uploads", express.static(path.resolve("uploads")));

// ---------- API ----------
app.use("/api/upload", uploadRoutes);     // POST upload + GET force download (pdf/video)
app.use("/api/cloudinary", cloudinaryRoutes); // signature pour images Cloudinary

// tes autres routes métiers
app.use("/api/", aadlRoutes);
app.use("/api/aadl", aadldemande);
app.use("/api/", docimpressionRoutes);        // expose /docimpression

// ---------- boot ----------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[HTTP] http://localhost:${PORT}`));
