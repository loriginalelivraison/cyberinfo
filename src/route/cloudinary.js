import express from "express";
import cloudinary from "cloudinary";

const router = express.Router();

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

router.post("/signature", (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);

  // ⚠️ ce dossier doit correspondre EXACTEMENT à celui utilisé dans Printing.jsx
  const paramsToSign = { timestamp, folder: "cyberinfo/docs" };

  const signature = cloudinary.v2.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  console.log("🔹 Signature générée:", { timestamp, signature });
  res.json({ timestamp, signature });
});

export default router;
