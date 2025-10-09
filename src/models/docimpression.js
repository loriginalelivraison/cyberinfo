import mongoose from "mongoose";

const FileSchema = new mongoose.Schema({
  url: { type: String, required: true },
  public_id: { type: String },
  format: { type: String },
  bytes: { type: Number },
  resource_type: {
    type: String,
    enum: ["image", "video", "raw", "file", "auto"],
    default: "raw",
  },
  original_filename: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const DocImpressionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  note: { type: String },
  files: { type: [FileSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("DocImpression", DocImpressionSchema);
