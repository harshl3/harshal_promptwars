import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { apiRouter } from "./apiRouter.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// API endpoints
app.use("/api", apiRouter);

// Serve static build files if in production
const distPath = path.resolve(__dirname, "../dist");
app.use(express.static(distPath));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) res.status(200).send("BlindSpot backend is running. Run `npm run build` to generate frontend bundle.");
  });
});

app.listen(PORT, () => {
  console.log(`🚀 BlindSpot server listening on http://localhost:${PORT}`);
  console.log(`🔑 Gemini API Key configured: ${Boolean(process.env.GEMINI_API_KEY)}`);
});
