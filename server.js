// /**
//  * server.js
//  * - Accepts two uploads: "car" and "background"
//  * - Saves background to /public/uploads and serves it
//  * - Encodes 'car' image as base64 and sends to xAI Grok Imagine image endpoint
//  *   with a prompt that references the public background URL
//  * - Returns the final composite image (base64 data URL) to the frontend
//  *
//  * Note: This is a simple demo. Production notes: validate files, sanitize filenames,
//  * rate-limit, secure your API key, and handle errors & quotas from xAI.
//  */

// require('dotenv').config();
// const express = require('express');
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');
// const axios = require('axios');
// const cors = require('cors');

// const app = express();
// const PORT = process.env.PORT || 3000;
// const XAI_API_KEY = process.env.XAI_API_KEY;
// if (!XAI_API_KEY) {
//   console.error('Please set XAI_API_KEY in your environment (.env).');
//   process.exit(1);
// }

// // static public folder (serves uploaded backgrounds)
// app.use(express.static(path.join(__dirname, 'public')));
// app.use(cors());
// app.use(express.json());

// const uploadDir = path.join(__dirname, 'public', 'uploads');
// if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// // multer setup (store temporarily in memory for car image, persist background)
// const storage = multer.memoryStorage();
// const upload = multer({ storage });

// /**
//  * POST /api/compose
//  * form-data fields:
//  *  - car: file (image)
//  *  - background: file (image)
//  */
// app.post('/api/compose', upload.fields([{ name: 'car', maxCount: 1 }, { name: 'background', maxCount: 1 }]), async (req, res) => {
//   try {
//     if (!req.files || !req.files.car || !req.files.background) {
//       return res.status(400).json({ error: 'Please upload both car and background images.' });
//     }

//     const carFile = req.files.car[0];
//     const bgFile = req.files.background[0];

//     // Save background to public/uploads so it is reachable via HTTP for the prompt
//     const bgFilename = `background-${Date.now()}${path.extname(bgFile.originalname) || '.jpg'}`;
//     const bgPath = path.join(uploadDir, bgFilename);
//     fs.writeFileSync(bgPath, bgFile.buffer);

//     // Public URL for the background (assuming local dev on same host)
//     // If deploying, use your public domain (https://yourdomain.com/uploads/...)
//     const host = req.get('host'); // e.g. localhost:3000
//     const protocol = req.protocol; // http
//     const backgroundUrl = `${protocol}://${host}/uploads/${bgFilename}`;

//     // Encode car image as base64 data URL (Grok docs show you can send base64 image_url).
//     const carMime = carFile.mimetype || 'image/jpeg';
//     const carB64 = carFile.buffer.toString('base64');
//     const carDataUrl = `data:${carMime};base64,${carB64}`;

//     // Compose a prompt referencing the background image URL and instruct model to place the car
//     const prompt = [
//       "Compose a photorealistic image by placing the car from the provided image onto the background image located at:",
//       backgroundUrl,
//       "Please remove any original background around the car (make the car appear naturally cut out),",
//       "adjust lighting and shadow realistically to match the background, keep the car's scale natural,",
//       "output the final photorealistic composite at similar resolution to the background image and do not add extra objects or text."
//     ].join(' ');

//     // Call xAI Grok Imagine image generation/edit endpoint.
//     // Docs: https://docs.x.ai/docs/guides/image-generations (use POST /v1/images/generations)
//     const apiUrl = 'https://api.x.ai/v1/images/generations';

//     const payload = {
//       model: "grok-imagine-image",          // model name per docs
//       image_url: carDataUrl,               // source image (car) as base64 data URL
//       prompt: prompt,
//       response_format: "b64_json"          // ask for base64 image back
//       // you can add other fields (aspect_ratio, n, etc.) if supported
//     };

//     const headers = {
//       'Authorization': `Bearer ${XAI_API_KEY}`,
//       'Content-Type': 'application/json'
//     };

//     const apiResp = await axios.post(apiUrl, payload, { headers, timeout: 120000 });
//     const data = apiResp.data;

//     // The exact response shape can vary. Try common patterns to find base64 image:
//     let b64 = null;
//     if (data?.image?.b64_json) b64 = data.image.b64_json;
//     else if (data?.b64_json) b64 = data.b64_json;
//     else if (Array.isArray(data?.data) && data.data[0]?.b64_json) b64 = data.data[0].b64_json;
//     else if (data?.data && data.data[0]?.image && data.data[0].image.b64_json) b64 = data.data[0].image.b64_json;
//     else if (data?.image) {
//       // fallback: if returned url, return to client as-is
//       return res.json({ result_url: data.image.url || data.image });
//     }

//     if (!b64) {
//       // If we couldn't find base64 payload, return the full API response for debugging
//       return res.status(500).json({ error: 'Unexpected API response', api_response: data });
//     }

//     // Build data URL and send to client
//     const composedDataUrl = `data:image/png;base64,${b64}`;
//     res.json({ composed_image: composedDataUrl, background_url: backgroundUrl });

//   } catch (err) {
//     console.error('Compose error:', err?.response?.data || err.message || err);
//     const message = err?.response?.data || err.message || 'Unknown error';
//     res.status(500).json({ error: 'Failed to compose image', details: message });
//   }
// });

// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// app.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });
// server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// create uploads dir
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// multer memory storage (we process buffers)
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/compose
 * - accepts 'car' (PNG/JPG) and 'background' (PNG/JPG)
 * - optional field: scale (0.1 - 1.0) - fraction of background width used for car
 *
 * Returns: { composed_image: "data:image/png;base64,..." }
 */
app.post('/api/compose', upload.fields([{ name: 'car', maxCount: 1 }, { name: 'background', maxCount: 1 }]), async (req, res) => {
  try {
    if (!req.files || !req.files.car || !req.files.background) {
      return res.status(400).json({ error: 'Please upload both car and background images.' });
    }

    const carBuffer = req.files.car[0].buffer;
    const bgBuffer = req.files.background[0].buffer;
    // scale param optional (client may send)
    const scaleParam = parseFloat(req.body.scale) || 0.5; // default car width = 50% of bg width
    const scale = Math.max(0.1, Math.min(1.0, scaleParam));

    // Load background metadata
    const bgSharp = sharp(bgBuffer);
    const bgMeta = await bgSharp.metadata();

    // Decide target car width
    const targetCarWidth = Math.round(bgMeta.width * scale);

    // Prepare car: ensure PNG with alpha
    let carSharp = sharp(carBuffer).png();
    const carMeta = await carSharp.metadata();

    // Resize car keeping aspect ratio
    const carResizedBuffer = await carSharp.resize({ width: targetCarWidth }).toBuffer();
    const carResizedMeta = await sharp(carResizedBuffer).metadata();

    // Create simple shadow by flattening transparent areas to black, blurring, lowering opacity
    // 1) Take carResized, flatten (transparent => black), blur it to create soft shadow
    const shadowBuffer = await sharp(carResizedBuffer)
      .flatten({ background: { r: 0, g: 0, b: 0 } }) // black silhouette
      .png()
      .blur(10)
      .toBuffer();

    // Determine positions: center horizontally, place car near bottom (20% from bottom)
    const left = Math.round((bgMeta.width - carResizedMeta.width) / 2);
    // place car bottom so that bottom sits at background height - margin
    const bottomMargin = Math.round(bgMeta.height * 0.06); // 6% margin
    const top = bgMeta.height - carResizedMeta.height - bottomMargin;

    // Composite order: background -> shadow (offset slightly) -> car
    // shadow offset (lower-right) to mimic light source
    const shadowOffsetX = Math.round(carResizedMeta.width * 0.04);
    const shadowOffsetY = Math.round(carResizedMeta.height * 0.06);

    // Compose
    const composed = await sharp(bgBuffer)
      .composite([
        // shadow (with reduced opacity)
        { input: shadowBuffer, left: left + shadowOffsetX, top: top + shadowOffsetY, blend: 'over', opacity: 0.45 },
        // actual car
        { input: carResizedBuffer, left, top, blend: 'over' }
      ])
      .png()
      .toBuffer();

    const dataUrl = `data:image/png;base64,${composed.toString('base64')}`;
    res.json({ composed_image: dataUrl });

  } catch (err) {
    console.error('Compose error:', err);
    res.status(500).json({ error: 'Failed to compose image', details: String(err.message || err) });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
