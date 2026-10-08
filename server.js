// const express = require("express");
// const cors = require("cors");
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// const app = express();
// const PORT = 5174;

// app.use(cors());

// const uploadDir = path.join(__dirname, "uploads");
// if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// // save the file in memory first, then we write it with the right name
// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
//   fileFilter: (req, file, cb) => {
//     if (path.extname(file.originalname).toLowerCase() !== ".stl") {
//       return cb(new Error("Only .stl files are allowed"));
//     }
//     cb(null, true);
//   },
// });

// app.post("/api/upload", upload.single("file"), (req, res) => {
//   const type = req.body.type; // "upper" or "lower"

//   if (!req.file) {
//     return res.status(400).json({ message: "No file received" });
//   }
//   if (type !== "upper" && type !== "lower") {
//     return res.status(400).json({ message: "Invalid file type" });
//   }

//   const fileName = type === "upper" ? "Upper.stl" : "Lower.stl";
//   fs.writeFileSync(path.join(uploadDir, fileName), req.file.buffer);

//   res.json({ message: `${fileName} uploaded successfully` });
// });

// app.use((err, req, res, next) => {
//   res.status(400).json({ message: err.message });
// });

// app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));





const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const PORT = 5174;

// path of the exe on your PC
const EXE_PATH = "C:/AutomaticTeethSegmenter/AutomaticTeethSegmenter.exe";

app.use(cors());

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

// lets the browser download result files, e.g. http://localhost:5174/files/upper/Output/Gum.stl
app.use("/files", express.static(uploadDir));

// ---------------- Upload ----------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".stl") {
      return cb(new Error("Only .stl files are allowed"));
    }
    cb(null, true);
  },
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  const type = req.body.type; // "upper" or "lower"

  if (!req.file) return res.status(400).json({ message: "No file received" });
  if (type !== "upper" && type !== "lower") {
    return res.status(400).json({ message: "Invalid file type" });
  }

  // each jaw has its own folder: uploads/upper/Upper.stl and uploads/lower/Lower.stl
  const jawDir = path.join(uploadDir, type);
  fs.mkdirSync(jawDir, { recursive: true });

  const fileName = type === "upper" ? "Upper.stl" : "Lower.stl";
  fs.writeFileSync(path.join(jawDir, fileName), req.file.buffer);

  // new file uploaded, so remove old segmentation results
  fs.rmSync(path.join(jawDir, "Output"), { recursive: true, force: true });

  res.json({ message: `${fileName} uploaded successfully` });
});

// ---------------- Segment ----------------
function runSegmenter(jaw) {
  return new Promise((resolve, reject) => {
    const jawDir = path.join(uploadDir, jaw);
    const inputFile = path.join(jawDir, jaw === "upper" ? "Upper.stl" : "Lower.stl");
    const outputDir = path.join(jawDir, "Output");

    if (!fs.existsSync(inputFile)) {
      return reject(new Error(`${jaw} scan is not uploaded`));
    }
    if (!fs.existsSync(EXE_PATH)) {
      return reject(new Error("Segmenter exe not found. Check EXE_PATH in server.js"));
    }

    fs.rmSync(outputDir, { recursive: true, force: true });

    // same as the QProcess code: exe <input.stl> --jaw upper|lower
    const child = spawn(EXE_PATH, [inputFile, "--jaw", jaw], {
      cwd: path.dirname(EXE_PATH), // run inside the exe folder so it finds the .dll files
    });

    let log = "";
    child.stdout.on("data", (d) => {
      log += d;
      console.log(`[${jaw}] ${d}`);
    });
    child.stderr.on("data", (d) => {
      log += d;
      console.error(`[${jaw}] ${d}`);
    });

    child.on("error", (err) =>
      reject(new Error("Could not start the exe: " + err.message))
    );

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`Segmentation failed for ${jaw} jaw (exit code ${code}). ${log.slice(-300)}`)
        );
      }
      if (!fs.existsSync(outputDir)) {
        return reject(new Error(`Output folder not found for ${jaw} jaw`));
      }
      const files = fs
        .readdirSync(outputDir)
        .filter((f) => f.toLowerCase().endsWith(".stl"));
      resolve(files);
    });
  });
}

app.post("/api/segment", async (req, res) => {
  try {
    const upperFiles = await runSegmenter("upper"); // about 20 sec
    const lowerFiles = await runSegmenter("lower"); // about 20 sec
    res.json({ upper: { files: upperFiles }, lower: { files: lowerFiles } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ---------------- Errors ----------------
app.use((err, req, res, next) => {
  res.status(400).json({ message: err.message });
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));