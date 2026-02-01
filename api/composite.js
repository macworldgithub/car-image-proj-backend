// // api/composite.js
// import express from "express";
// import multer from "multer";
// import FormData from "form-data";
// import axios from "axios";
// import dotenv from "dotenv";
// import cors from "cors";
// import serverless from "serverless-http";

// dotenv.config();

// const app = express();

// // Use memory storage so we can send buffers directly to OpenAI
// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
// });

// // Allow requests from any origin (adjust for production)
// app.use(cors({ origin: true }));

// // Healthcheck at /api/composite (GET)
// app.get("/", (req, res) => res.send("OpenAI composite backend running (Vercel)"));

// app.post(
//   "/",
//   upload.fields([
//     { name: "car", maxCount: 1 },
//     { name: "background", maxCount: 1 },
//     { name: "logo", maxCount: 1 }, // optional
//   ]),
//   async (req, res) => {
//     try {
//       if (!req.files || !req.files.car || !req.files.background) {
//         return res
//           .status(400)
//           .json({ success: false, error: "Please upload both 'car' and 'background' files." });
//       }

//       const carFile = req.files.car[0];
//       const bgFile = req.files.background[0];
//       const logoFile = req.files.logo && req.files.logo[0] ? req.files.logo[0] : null;

//       const form = new FormData();

//       // car first, background second (OpenAI edits API expects that ordering for image[]).
//       form.append("image[]", carFile.buffer, { filename: carFile.originalname });
//       form.append("image[]", bgFile.buffer, { filename: bgFile.originalname });

//       if (logoFile) {
//         form.append("image[]", logoFile.buffer, { filename: logoFile.originalname });
//       }

//       // Clear, explicit prompt describing expected edit behavior
//       const promptLines = [
//         "You are an image-editing assistant.",
//         "Composite the first image (a car) onto the second image (the background).",
//         "Place the car naturally into the background — match scale, perspective, lighting and shadows so the final image looks photorealistic.",
//         "Keep the full car visible and produce a single clean final image with no UI overlays, borders or text."
//       ];

//       if (logoFile) {
//         promptLines.push(
//           "A third image is provided (a logo). Stamp that logo onto the car's license plate to fully cover/hide the plate number.",
//           "Place the logo so it follows the license plate perspective and size, matching lighting and surface reflection; add a natural shadow and slight texture so the logo looks like it's printed/stamped on the plate.",
//           "Do NOT alter other parts of the car except for necessary lighting/match to make the logo placement realistic."
//         );
//       } else {
//         promptLines.push("No logo image was provided — do not alter or obscure the license plate.");
//       }

//       promptLines.push("Return only the final composite image (no extra text).");
//       const prompt = promptLines.join(" ");

//       form.append("model", "gpt-image-1.5");
//       form.append("prompt", prompt);
//       form.append("n", "1");
//       form.append("size", "1024x1024");
//       form.append("input_fidelity", "high");

//       const openaiResp = await axios.post("https://api.openai.com/v1/images/edits", form, {
//         headers: {
//           Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
//           ...form.getHeaders(),
//         },
//         maxContentLength: Infinity,
//         maxBodyLength: Infinity,
//         timeout: 120000,
//       });

//       if (!openaiResp.data || !openaiResp.data.data || !openaiResp.data.data[0].b64_json) {
//         return res
//           .status(500)
//           .json({ success: false, error: "Unexpected response from OpenAI API", raw: openaiResp.data });
//       }

//       const b64 = openaiResp.data.data[0].b64_json;
//       const dataUrl = `data:image/png;base64,${b64}`;

//       res.json({ success: true, image: dataUrl });
//     } catch (err) {
//       console.error("Error in /api/composite:", err?.response?.data ?? err.message ?? err);
//       const openaiErr = err?.response?.data ?? null;
//       res.status(500).json({ success: false, error: "Failed to composite images", details: openaiErr || err.message });
//     }
//   }
// );

// // Wrap the express app and export the handler for Vercel.
// // Because this file is api/composite.js, Vercel exposes it at: POST /api/composite
// export default serverless(app);

// api/composite.js
import express from "express";
import multer from "multer";
import FormData from "form-data";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import serverless from "serverless-http";

dotenv.config();

const app = express();

// IMPORTANT: Register CORS early
app.use(cors({ origin: true, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));

// Also make sure preflight is handled explicitly
app.options("*", cors({ origin: true }));

// Fallback middleware to always set CORS headers (ensures error responses have them)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// Optional: check env var early to avoid confusing 500s from OpenAI calls
if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in environment! Set it in Vercel env vars.");
  // Note: In Vercel you can't exit the function, but logging makes it visible in Vercel logs.
}

// Healthcheck
app.get("/", (req, res) => res.send("OpenAI composite backend running (Vercel)"));

// Main POST handler
app.post(
  "/",
  upload.fields([
    { name: "car", maxCount: 1 },
    { name: "background", maxCount: 1 },
    { name: "logo", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ success: false, error: "Server misconfiguration: OPENAI_API_KEY missing" });
      }

      if (!req.files || !req.files.car || !req.files.background) {
        return res.status(400).json({ success: false, error: "Please upload both 'car' and 'background' files." });
      }

      const carFile = req.files.car[0];
      const bgFile = req.files.background[0];
      const logoFile = req.files.logo && req.files.logo[0] ? req.files.logo[0] : null;

      const form = new FormData();
      form.append("image[]", carFile.buffer, { filename: carFile.originalname });
      form.append("image[]", bgFile.buffer, { filename: bgFile.originalname });
      if (logoFile) form.append("image[]", logoFile.buffer, { filename: logoFile.originalname });

      const promptLines = [
        "You are an image-editing assistant.",
        "Composite the first image (a car) onto the second image (the background).",
        "Place the car naturally into the background — match scale, perspective, lighting and shadows so the final image looks photorealistic.",
        "Keep the full car visible and produce a single clean final image with no UI overlays, borders or text."
      ];
      if (logoFile) {
        promptLines.push(
          "A third image is provided (a logo). Stamp that logo onto the car's license plate to fully cover/hide the plate number.",
          "Place the logo so it follows the license plate perspective and size, matching lighting and surface reflection; add a natural shadow and slight texture so the logo looks like it's printed/stamped on the plate.",
          "Do NOT alter other parts of the car except for necessary lighting/match to make the logo placement realistic."
        );
      } else {
        promptLines.push("No logo image was provided — do not alter or obscure the license plate.");
      }
      promptLines.push("Return only the final composite image (no extra text).");
      const prompt = promptLines.join(" ");

      form.append("model", "gpt-image-1.5");
      form.append("prompt", prompt);
      form.append("n", "1");
      form.append("size", "1024x1024");
      form.append("input_fidelity", "high");

      const openaiResp = await axios.post("https://api.openai.com/v1/images/edits", form, {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...form.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 120000,
      });

      if (!openaiResp.data || !openaiResp.data.data || !openaiResp.data.data[0].b64_json) {
        console.error("Unexpected OpenAI response:", openaiResp.data);
        return res.status(500).json({ success: false, error: "Unexpected response from OpenAI API", raw: openaiResp.data });
      }

      const b64 = openaiResp.data.data[0].b64_json;
      const dataUrl = `data:image/png;base64,${b64}`;

      res.json({ success: true, image: dataUrl });
    } catch (err) {
      // Log as much as possible (without printing secret keys)
      console.error("Error in /api/composite:", err?.response?.data ?? err.message ?? err);
      // Ensure CORS header is present even on error
      res.setHeader("Access-Control-Allow-Origin", "*");
      const openaiErr = err?.response?.data ?? null;
      res.status(500).json({ success: false, error: "Failed to composite images", details: openaiErr || err.message });
    }
  }
);

// Export for Vercel
export default serverless(app);
