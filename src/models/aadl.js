import mongoose from "mongoose";


const aadldemandeSchema= new mongoose.Schema(
{
name: { type: String, required: true, trim: true },
familyname: { type: String, default: "" },
phone: { type: String, required: true, min: 0 }, // price in your chosen currency
},
{ timestamps: true }
);

export default mongoose.model("aadldemande", aadldemandeSchema);

