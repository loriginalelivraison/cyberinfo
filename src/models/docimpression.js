import mongoose from "mongoose";

const FileSchema = new mongoose.Schema({
  url: String,
  public_id: String,
  format: String,
  bytes: Number,
  resource_type: String,
  original_filename: String,
}, { _id: false });

const DocImpressionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  files: { type: [FileSchema], default: [] },
}, { timestamps: true });

export default mongoose.model("DocImpression", DocImpressionSchema);
