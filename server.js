// const express = require("express");
// const cors = require("cors");
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");
// const { spawn } = require("child_process");

// const app = express();
// const PORT = 5174;

// // ===== Exe 1: teeth segmenter =====
// const SEGMENTER_EXE = "C:/AutomaticTeethSegmenter/AutomaticTeethSegmenter.exe";

// // ===== Exe 2: Identify LAT =====
// const LAT_EXE = "C:/IdentifyLAT/GeometryKernel.exe";

// // GeometryKernel.exe IdentifyLAT <dir path> <jaw>   (jaw is "upper" or "lower")
// function getLatArgs(jaw, inputFile, outputDir) {
//   return ["IdentifyLAT", outputDir, jaw];
// }

// app.use(cors());

// // const uploadDir = path.join(__dirname, "uploads");
// const uploadDir = "D:/Temp/uploads";
// fs.mkdirSync(uploadDir, { recursive: true });

// // lets the browser download files, e.g. http://localhost:5174/files/upper/Output/...
// app.use("/files", express.static(uploadDir));

// // ---------------- Upload ----------------
// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 200 * 1024 * 1024 },
//   fileFilter: (req, file, cb) => {
//     if (path.extname(file.originalname).toLowerCase() !== ".stl") {
//       return cb(new Error("Only .stl files are allowed"));
//     }
//     cb(null, true);
//   },
// });

// app.post("/api/upload", upload.single("file"), (req, res) => {
//   const type = req.body.type; // "upper" or "lower"

//   if (!req.file) return res.status(400).json({ message: "No file received" });
//   if (type !== "upper" && type !== "lower") {
//     return res.status(400).json({ message: "Invalid file type" });
//   }

//   const jawDir = path.join(uploadDir, type);
//   fs.mkdirSync(jawDir, { recursive: true });

//   const fileName = type === "upper" ? "Upper.stl" : "Lower.stl";
//   fs.writeFileSync(path.join(jawDir, fileName), req.file.buffer);

//   // new file uploaded, so old results are no longer valid
//   fs.rmSync(path.join(jawDir, "Output"), { recursive: true, force: true });

//   res.json({ message: `${fileName} uploaded successfully` });
// });

// // ---------------- Helper: run any exe ----------------
// function runExe(exePath, args, tag) {
//   return new Promise((resolve, reject) => {
//     if (!fs.existsSync(exePath)) {
//       return reject(new Error(`Exe not found: ${exePath}`));
//     }

//     const child = spawn(exePath, args, { cwd: path.dirname(exePath) });

//     let log = "";
//     child.stdout.on("data", (d) => {
//       log += d;
//       console.log(`[${tag}] ${d}`);
//     });
//     child.stderr.on("data", (d) => {
//       log += d;
//       console.error(`[${tag}] ${d}`);
//     });

//     child.on("error", (err) => reject(new Error("Could not start exe: " + err.message)));
//     child.on("close", (code) => {
//       if (code !== 0) {
//         return reject(new Error(`${tag} failed (exit code ${code}). ${log.slice(-300)}`));
//       }
//       resolve(log);
//     });
//   });
// }

// function jawPaths(jaw) {
//   const jawDir = path.join(uploadDir, jaw);
//   return {
//     jawDir,
//     inputFile: path.join(jawDir, jaw === "upper" ? "Upper.stl" : "Lower.stl"),
//     outputDir: path.join(jawDir, "Output"),
//   };
// }

// // ---------------- Identify LAT (runs in the background, with progress) ----------------

// // The browser reads this status every second to fill the progress bar
// let latJob = {
//   running: false,
//   done: false,
//   percent: 0,
//   label: "",
//   error: null,
//   csvFiles: null,
// };

// async function runIdentifyLat() {
//   const jaws = ["upper", "lower"];
//   const totalSteps = 4; // segment upper, segment lower, LAT upper, LAT lower
//   let finished = 0;

//   const startStep = (label) => {
//     latJob.label = label;
//     latJob.percent = Math.round((finished / totalSteps) * 100);
//   };
//   const endStep = () => {
//     finished++;
//     latJob.percent = Math.round((finished / totalSteps) * 100);
//   };

//   try {
//     // Step 1: exe 1 for both jaws -> Gum + individual teeth in the Output folders
//     for (const jaw of jaws) {
//       const { inputFile, outputDir } = jawPaths(jaw);

//       if (!fs.existsSync(inputFile)) {
//         throw new Error(`${jaw} scan is not uploaded`);
//       }

//       startStep(`Segmenting ${jaw} jaw...`);
//       fs.rmSync(outputDir, { recursive: true, force: true });
//       await runExe(SEGMENTER_EXE, [inputFile, "--jaw", jaw], `${jaw} segmenter`);

//       if (!fs.existsSync(outputDir)) {
//         throw new Error(`Output folder not found for ${jaw} jaw`);
//       }
//       endStep();
//     }

//     // Step 2: exe 2 (Identify LAT) for both jaws
//     const csvFiles = {};

//     for (const jaw of jaws) {
//       const { inputFile, outputDir } = jawPaths(jaw);

//       startStep(`Identifying LAT for ${jaw} jaw...`);
//       await runExe(LAT_EXE, getLatArgs(jaw, inputFile, outputDir), `${jaw} LAT`);

//       // list the CSV files the exe created
//       csvFiles[jaw] = fs
//         .readdirSync(outputDir)
//         .filter((f) => f.toLowerCase().endsWith(".csv"));
//       endStep();
//     }

//     console.log("LAT csv files:", csvFiles);
//     latJob.csvFiles = csvFiles;
//     latJob.percent = 100;
//     latJob.label = "Identify LAT completed";
//     latJob.done = true;
//   } catch (err) {
//     latJob.error = err.message;
//     latJob.done = true;
//   } finally {
//     latJob.running = false;
//   }
// }

// // start the job and answer immediately
// app.post("/api/identify-lat", (req, res) => {
//   if (latJob.running) {
//     return res.status(409).json({ message: "Identify LAT is already running" });
//   }

//   latJob = {
//     running: true,
//     done: false,
//     percent: 0,
//     label: "Starting...",
//     error: null,
//     csvFiles: null,
//   };

//   runIdentifyLat();
//   res.json({ started: true });
// });

// // the browser asks this every second
// app.get("/api/identify-lat/status", (req, res) => {
//   res.json(latJob);
// });

// // ---------------- Errors ----------------
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

// =====================================================================
// CONFIG: all paths are hardcoded here, in one place
// =====================================================================

// Exe 1: teeth segmenter
const SEGMENTER_EXE = "C:/AutomaticTeethSegmenter/AutomaticTeethSegmenter.exe";

// Exe 2: Identify LAT
const LAT_EXE = "C:/IdentifyLAT/GeometryKernel.exe";

// Main working folder
const UPLOAD_DIR = "D:\\Temp\\uploads";

// Jaw folders. IMPORTANT: each path must END WITH A BACKSLASH,
// because GeometryKernel.exe adds "Output\" to the end of this text
// without any separator (so ...\upper\ becomes ...\upper\Output\).
const JAW_DIRS = {
  upper: "D:\\Temp\\uploads\\upper\\",
  lower: "D:\\Temp\\uploads\\lower\\",
};

// File names of the uploaded scans
const JAW_FILES = {
  upper: "Upper.stl",
  lower: "Lower.stl",
};

// Which jaws Identify LAT processes (add "lower" here to process both)
const JAWS_TO_PROCESS = ["upper","lower"];

// =====================================================================

app.use(cors());

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// lets the browser download files from the working folder
app.use("/files", express.static(UPLOAD_DIR));

// The three paths of one jaw
function jawPaths(jaw) {
  const jawDir = JAW_DIRS[jaw];
  return {
    jawDir, // D:\Temp\uploads\upper\
    inputFile: path.join(jawDir, JAW_FILES[jaw]), // D:\Temp\uploads\upper\Upper.stl
    outputDir: path.join(jawDir, "Output"), // D:\Temp\uploads\upper\Output
  };
}

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

  const { jawDir, inputFile, outputDir } = jawPaths(type);

  fs.mkdirSync(jawDir, { recursive: true });
  fs.writeFileSync(inputFile, req.file.buffer);

  // new file uploaded, so old results are no longer valid
  fs.rmSync(outputDir, { recursive: true, force: true });

  res.json({ message: `${JAW_FILES[type]} uploaded successfully` });
});

// ---------------- Helper: run any exe ----------------
function runExe(exePath, args, tag) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(exePath)) {
      return reject(new Error(`Exe not found: ${exePath}`));
    }

    // shows the exact command in the backend terminal
    console.log(`[${tag}] RUN:`, exePath, JSON.stringify(args));

    const child = spawn(exePath, args, { cwd: path.dirname(exePath) });

    let log = "";
    child.stdout.on("data", (d) => {
      log += d;
      console.log(`[${tag}] ${d}`);
    });
    child.stderr.on("data", (d) => {
      log += d;
      console.error(`[${tag}] ${d}`);
    });

    child.on("error", (err) => reject(new Error("Could not start exe: " + err.message)));
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`${tag} failed (exit code ${code}). ${log.slice(-300)}`));
      }
      resolve(log);
    });
  });
}

// ---------------- Exe 1: segmenter (its own function) ----------------
// AutomaticTeethSegmenter.exe <Upper.stl> --jaw upper
// Creates <jaw folder>\Output with Gum.stl and the tooth STL files
async function runSegmenterExe(jaw) {
  const { inputFile, outputDir } = jawPaths(jaw);

  if (!fs.existsSync(inputFile)) {
    throw new Error(`${jaw} scan is not uploaded`);
  }

  // remove old results before a new run
  fs.rmSync(outputDir, { recursive: true, force: true });

  await runExe(SEGMENTER_EXE, [inputFile, "--jaw", jaw], `${jaw} segmenter`);

  if (!fs.existsSync(outputDir)) {
    throw new Error(`Output folder not found for ${jaw} jaw`);
  }
}

// ---------------- Exe 2: Identify LAT (its own function) ----------------
// GeometryKernel.exe IdentifyLAT <jaw folder ending with \> <jaw>
// Example: GeometryKernel.exe IdentifyLAT D:\Temp\uploads\upper\ upper
// The exe adds "Output\" itself, so it works in D:\Temp\uploads\upper\Output\
async function runLatExe(jaw) {
  const { jawDir, outputDir } = jawPaths(jaw);

  const args = ["IdentifyLAT", jawDir, jaw];
  await runExe(LAT_EXE, args, `${jaw} LAT`);

  // list the CSV files that the exe created
  if (!fs.existsSync(outputDir)) return [];
  return fs.readdirSync(outputDir).filter((f) => f.toLowerCase().endsWith(".csv"));
}

// ---------------- Identify LAT job (with progress) ----------------

// The browser reads this status every second to fill the progress bar
let latJob = {
  running: false,
  done: false,
  percent: 0,
  label: "",
  error: null,
  csvFiles: null,
};

async function runIdentifyLatJob() {
  const jaws = JAWS_TO_PROCESS;
  const totalSteps = jaws.length * 2; // segmenter + LAT for each jaw
  let finished = 0;

  const startStep = (label) => {
    latJob.label = label;
    latJob.percent = Math.round((finished / totalSteps) * 100);
  };
  const endStep = () => {
    finished++;
    latJob.percent = Math.round((finished / totalSteps) * 100);
  };

  try {
    // Step 1: exe 1 for each jaw
    for (const jaw of jaws) {
      startStep(`Segmenting ${jaw} jaw...`);
      await runSegmenterExe(jaw);
      endStep();
    }

    // Step 2: exe 2 for each jaw
    const csvFiles = {};
    for (const jaw of jaws) {
      startStep(`Identifying LAT for ${jaw} jaw...`);
      csvFiles[jaw] = await runLatExe(jaw);
      endStep();
    }

    console.log("LAT csv files:", csvFiles);
    latJob.csvFiles = csvFiles;
    latJob.percent = 100;
    latJob.label = "Identify LAT completed";
    latJob.done = true;
  } catch (err) {
    latJob.error = err.message;
    latJob.done = true;
  } finally {
    latJob.running = false;
  }
}

// start the job and answer immediately
app.post("/api/identify-lat", (req, res) => {
  if (latJob.running) {
    return res.status(409).json({ message: "Identify LAT is already running" });
  }

  latJob = {
    running: true,
    done: false,
    percent: 0,
    label: "Starting...",
    error: null,
    csvFiles: null,
  };

  runIdentifyLatJob();
  res.json({ started: true });
});

// the browser asks this every second
app.get("/api/identify-lat/status", (req, res) => {
  res.json(latJob);
});

// ---------------- Errors ----------------
app.use((err, req, res, next) => {
  res.status(400).json({ message: err.message });
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));


