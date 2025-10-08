import { Router } from "express";
import aadldemande from "../models/aadl.js";

const r =Router();

r.post("/", async (req, res) => {
  try {
    const { name, familyname = "", phone } = req.body;

    // Vérification des champs obligatoires
    if (!name || !phone) {
      return res.status(400).json({ error: "name et phone sont obligatoires" });
    }

    // Création et sauvegarde
    const created = await aadldemande.create({ name, familyname, phone });

    res.status(201).json(created); // renvoie l'objet inséré
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;