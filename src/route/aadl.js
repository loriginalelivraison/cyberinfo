import { Router } from "express";
import aadldemande from "../models/aadl.js";

const r =Router();

r.get("/listdemandesaadl", async (_req, res) => {
try{
    const items = await aadldemande.find({}).lean(); 
    res.json(items);
}
catch{
    console.log("err a la recuperation ")
}

});


export default r;