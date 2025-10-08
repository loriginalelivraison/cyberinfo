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
app.use(
  cors({
    origin: process.env.CORS_ORIGIN, // ex: http://localhost:5173
    credentials: true,
  })
);

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
app.use("/uploads", express.static(path.resolve("uploads")));

// ---------- API ----------
app.use("/api/upload", uploadRoutes);     // POST upload + GET force download (pdf/video)
app.use("/cloudinary", cloudinaryRoutes); // signature pour images Cloudinary

// tes autres routes métiers
app.use("/", aadlRoutes);
app.use("/aadl", aadldemande);
app.use("/", docimpressionRoutes);        // expose /docimpression

// ---------- boot ----------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[HTTP] http://localhost:${PORT}`));
