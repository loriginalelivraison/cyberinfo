import mongoose from "mongoose";


export default async function connectDB(uri) {
if (!uri) throw new Error("MONGODB_URI missing");
// recommended flags
mongoose.set("strictQuery", true);
try {
await mongoose.connect(uri);
console.log("[DB] connected");
} catch (err) {
console.error("[DB] connection error:", err.message);
process.exit(1);
}
}