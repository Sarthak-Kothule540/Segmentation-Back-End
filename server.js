


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

// Exe 2: GeometryKernel (Identify LAT and Segment)
// const LAT_EXE = "C:/IdentifyLAT/GeometryKernel.exe";
const GEOMETRY_KERNEL_EXE = "C:/Release/GeometryKernel.exe";

// The first argument of GeometryKernel.exe: which job it should do
const LAT_COMMAND = "IdentifyLAT";
const SEGMENT_COMMAND = "Segment";





// Main working folder
const UPLOAD_DIR = "D:\\Temp\\uploads";

// second argument of GeometryKernel.exe: the common folder for both jaws
const EXE_WORK_DIR = "D:/Temp/uploads/";

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

// Which jaws are processed
const JAWS_TO_PROCESS = ["upper", "lower"];

// The jaw text that GeometryKernel.exe expects as its 3rd argument
const LAT_JAW_ARG = {
  upper: "upper",
  lower: "lower",
};

// When an edited LAT is saved, the original csv is copied once into this
// sub-folder of Output, so the exe's original LAT is never lost
const BACKUP_DIR_NAME = "Original";



// =====================================================================

app.use(cors());
app.use(express.json({ limit: "20mb" })); // needed to receive the edited curves

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

// every file in a folder (also in sub-folders) with its size and last-change time
function snapshotFiles(dir, base = dir, result = {}) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      snapshotFiles(full, base, result);
    } else {
      const st = fs.statSync(full);
      result[path.relative(base, full)] = `${st.size}-${st.mtimeMs}`;
    }
  }
  return result;
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

  
  
  fs.rmSync(outputDir, { recursive: true, force: true });

  await runExe(SEGMENTER_EXE, [inputFile, "--jaw", jaw], `${jaw} segmenter`);

  if (!fs.existsSync(outputDir)) {
    throw new Error(`Output folder not found for ${jaw} jaw`);
  }
}

// ---------------- Exe 2: Identify LAT ----------------




// GeometryKernel.exe IdentifyLAT <jaw folder ending with \> <jaw text>
// Example: GeometryKernel.exe IdentifyLAT D:\Temp\uploads\upper\ upper
// The exe adds "Output\" itself, so it works in D:\Temp\uploads\upper\Output\
// async function runLatExe(jaw) {
//   if (jaw === "lower" && LOWER_NUMBER_WORKAROUND) {
//     return runLatExeLowerViaProxy();
//   }

//   const { jawDir, outputDir } = jawPaths(jaw);

//   const before = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];

//   const args = [LAT_COMMAND, jawDir, LAT_JAW_ARG[jaw]];
//   await runExe(LAT_EXE, args, `${jaw} LAT`);

//   const after = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];

//   // every file the exe created (any type), and the total
//   console.log(`[${jaw} LAT] files before: ${before.length}, after: ${after.length}`);
//   console.log(`[${jaw} LAT] new files:`, after.filter((f) => !before.includes(f)));

//   // list the CSV files that the exe created
//   return after.filter((f) => f.toLowerCase().endsWith(".csv"));
// }


// GeometryKernel.exe IdentifyLAT <jaw folder ending with \> <jaw text>
// async function runLatExe(jaw) {
//   const { jawDir, outputDir } = jawPaths(jaw);

//   const before = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];

//   const args = [LAT_COMMAND, jawDir, LAT_JAW_ARG[jaw]];
//   await runExe(GEOMETRY_KERNEL_EXE, args, `${jaw} LAT`);

//   const after = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];

//   console.log(`[${jaw} LAT] files before: ${before.length}, after: ${after.length}`);
//   console.log(`[${jaw} LAT] new files:`, after.filter((f) => !before.includes(f)));

//   // list the CSV files that the exe created
//   return after.filter((f) => f.toLowerCase().endsWith(".csv"));
// }


// GeometryKernel.exe IdentifyLAT <jaw folder ending with \> <jaw text>
// async function runLatExe(jaw) {
//   const { jawDir, outputDir } = jawPaths(jaw);

//   const before = snapshotFiles(outputDir);

//   // const args = [LAT_COMMAND, jawDir, LAT_JAW_ARG[jaw]];
//   // const args = [LAT_COMMAND, EXE_WORK_DIR, LAT_JAW_ARG[jaw]];
//   const args = [LAT_COMMAND, EXE_WORK_DIR];

//   // the exe may return an error code (1) even when it did its work,
//   // so the error is kept and checked after we look at the CSV files
//   let failure = null;
//   try {
//     await runExe(GEOMETRY_KERNEL_EXE, args, `${jaw} LAT`);
//   } catch (err) {
//     failure = err;
//   }

//   const after = snapshotFiles(outputDir);

//   // CSV files that the exe created or changed in this run
//   const csvFiles = Object.keys(after).filter(
//     (f) =>
//       f.toLowerCase().endsWith(".csv") &&
//       !f.includes(path.sep) && // only files directly in Output (not Original)
//       (!(f in before) || after[f] !== before[f])
//   );

//   console.log(`[${jaw} LAT] csv files created or changed:`, csvFiles);

//   if (failure) {
//     if (csvFiles.length === 0) throw failure; // a real failure: no result
//     console.warn(`[${jaw} LAT] the exe returned an error code, but the csv files exist, so it is accepted.`);
//     console.warn(`[${jaw} LAT] ${failure.message}`);
//   }

//   return csvFiles;
// }



// GeometryKernel.exe IdentifyLAT <common folder>   (ONE call for both jaws)
async function runLatExe(jaws) {
  const before = {};
  for (const jaw of jaws) before[jaw] = snapshotFiles(jawPaths(jaw).outputDir);

  // the exe may return an error code (1) even when it did its work
  let failure = null;
  try {
    await runExe(GEOMETRY_KERNEL_EXE, [LAT_COMMAND, EXE_WORK_DIR], "IdentifyLAT");
  } catch (err) {
    failure = err;
  }

  // CSV files that the exe created or changed, for each jaw
  const csvFiles = {};
  for (const jaw of jaws) {
    const after = snapshotFiles(jawPaths(jaw).outputDir);
    csvFiles[jaw] = Object.keys(after).filter(
      (f) =>
        f.toLowerCase().endsWith(".csv") &&
        !f.includes(path.sep) && // only files directly in Output (not Original)
        (!(f in before[jaw]) || after[f] !== before[jaw][f])
    );
    console.log(`[${jaw} LAT] csv files created or changed:`, csvFiles[jaw]);
  }

  if (failure) {
    const missing = jaws.filter((jaw) => csvFiles[jaw].length === 0);
    if (missing.length > 0) throw failure; // a real failure: a jaw has no result
    console.warn("[IdentifyLAT] the exe returned an error code, but the csv files exist, so it is accepted.");
    console.warn(`[IdentifyLAT] ${failure.message}`);
  }

  return csvFiles; // { upper: [...], lower: [...] }
}








// ---------------- Exe 2: Segment (separates teeth and gum) ----------------

// Same arguments as Identify LAT, only the first one is different.
// async function runSegmentExe(jaw) {
//   const { jawDir } = jawPaths(jaw);

//   const before = snapshotFiles(jawDir);

//   const args = [SEGMENT_COMMAND, jawDir, LAT_JAW_ARG[jaw]];
//   // await runExe(LAT_EXE, args, `${jaw} Segment`);

//   await runExe(GEOMETRY_KERNEL_EXE, args, `${jaw} Segment`);

//   const after = snapshotFiles(jawDir);

//   // files that did not exist before, and files that were overwritten
//   const created = Object.keys(after).filter((f) => !(f in before));
//   const changed = Object.keys(after).filter((f) => f in before && after[f] !== before[f]);

//   console.log(`[${jaw} Segment] new files:`, created);
//   console.log(`[${jaw} Segment] changed (overwritten) files:`, changed);

//   return { created, changed };
// }


// Same arguments as Identify LAT, only the first one is different.
// async function runSegmentExe(jaw) {
//   segmenterDone[jaw] = false; // Segment overwrites the STL files in Output
//   const { jawDir } = jawPaths(jaw);


// async function runSegmentExe(jaw) {
//   const { jawDir } = jawPaths(jaw);

//   const before = snapshotFiles(jawDir);

//   // const args = [SEGMENT_COMMAND, jawDir, LAT_JAW_ARG[jaw]];
//   // const args = [SEGMENT_COMMAND, EXE_WORK_DIR, LAT_JAW_ARG[jaw]];

//   const args = [SEGMENT_COMMAND, EXE_WORK_DIR];

//   // the exe may return an error code (1) even when it did its work,
//   // so the error is kept and checked after we look at the files
//   let failure = null;
//   try {
//     await runExe(GEOMETRY_KERNEL_EXE, args, `${jaw} Segment`);
//   } catch (err) {
//     failure = err;
//   }

//   const after = snapshotFiles(jawDir);

//   // files that did not exist before, and files that were overwritten
//   const created = Object.keys(after).filter((f) => !(f in before));
//   const changed = Object.keys(after).filter((f) => f in before && after[f] !== before[f]);

//   console.log(`[${jaw} Segment] new files:`, created);
//   console.log(`[${jaw} Segment] changed (overwritten) files:`, changed);

//   if (failure) {
//     if (created.length + changed.length === 0) throw failure; // a real failure: no result
//     console.warn(`[${jaw} Segment] the exe returned an error code, but it wrote files, so it is accepted.`);
//     console.warn(`[${jaw} Segment] ${failure.message}`);
//   }

//   return { created, changed };
// }




// GeometryKernel.exe Segment <common folder>   (ONE call for both jaws)
async function runSegmentExe(jaws) {
  const before = {};
  for (const jaw of jaws) before[jaw] = snapshotFiles(jawPaths(jaw).jawDir);

  let failure = null;
  try {
    await runExe(GEOMETRY_KERNEL_EXE, [SEGMENT_COMMAND, EXE_WORK_DIR], "Segment");
  } catch (err) {
    failure = err;
  }

  const report = {};
  for (const jaw of jaws) {
    const after = snapshotFiles(jawPaths(jaw).jawDir);
    const created = Object.keys(after).filter((f) => !(f in before[jaw]));
    const changed = Object.keys(after).filter((f) => f in before[jaw] && after[f] !== before[jaw][f]);
    console.log(`[${jaw} Segment] new files:`, created);
    console.log(`[${jaw} Segment] changed (overwritten) files:`, changed);
    report[jaw] = { created, changed };
  }

  if (failure) {
    const missing = jaws.filter((jaw) => report[jaw].created.length + report[jaw].changed.length === 0);
    if (missing.length > 0) throw failure;
    console.warn("[Segment] the exe returned an error code, but it wrote files, so it is accepted.");
    console.warn(`[Segment] ${failure.message}`);
  }

  return report; // { upper: { created, changed }, lower: { created, changed } }
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
  // const totalSteps = jaws.length * 2; // segmenter + LAT for each jaw
  const totalSteps = jaws.length + 1; // segmenter for each jaw + LAT once
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

    


    // Step 2: exe 2 (Identify LAT) for each jaw
    // const csvFiles = {};
    // for (const jaw of jaws) {
    //   startStep(`Identifying LAT for ${jaw} jaw...`);
    //   csvFiles[jaw] = await runLatExe(jaw);
    //   endStep();
    // }


     // Step 2: exe 2 (Identify LAT), ONE call for both jaws
    startStep("Identifying LAT for upper and lower jaw...");
    const csvFiles = await runLatExe(jaws);
    endStep();



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

// ---------------- Segment job (with progress) ----------------
let segmentJob = {
  running: false,
  done: false,
  percent: 0,
  label: "",
  error: null,
  newFiles: null,
  stlFiles: null,
  numberFiles: null,
};

// async function runSegmentJob() {
//   // const jaws = JAWS_TO_PROCESS;
//   // let finished = 0;

//   // try {
//   //   const newFiles = {};

//   //   for (const jaw of jaws) {
//   //     segmentJob.label = `Separating teeth and gum for ${jaw} jaw...`;
//   //     segmentJob.percent = Math.round((finished / jaws.length) * 100);

//   //     newFiles[jaw] = await runSegmentExe(jaw);
//   //     finished++;
//   //   }


//     const jaws = JAWS_TO_PROCESS;
//   const totalSteps = jaws.length * 2; // Segment + TeethNumber for each jaw
//   let finished = 0;

//   try {
//     const newFiles = {};
//     const numberFiles = {};

//     for (const jaw of jaws) {
//       // exe 1: the existing Segment command (C:/IdentifyLAT)
//       segmentJob.label = `Separating teeth and gum for ${jaw} jaw...`;
//       segmentJob.percent = Math.round((finished / totalSteps) * 100);
//       newFiles[jaw] = await runSegmentExe(jaw);
//       finished++;

//       // exe 2: the new exe (C:/NewExe/Release) with the TeethNumber command
//       segmentJob.label = `Numbering the teeth of ${jaw} jaw...`;
//       segmentJob.percent = Math.round((finished / totalSteps) * 100);
//       numberFiles[jaw] = await newExe.runTeethNumber(jaw);
//       finished++;
//     }

//     segmentJob.numberFiles = numberFiles;

//     // every STL file in the Output folders (gum and teeth) is sent to the browser
//     const stlFiles = {};
//     for (const jaw of jaws) {
//       const { outputDir } = jawPaths(jaw);
//       stlFiles[jaw] = fs
//         .readdirSync(outputDir)
//         .filter((f) => f.toLowerCase().endsWith(".stl"));
//     }

//     console.log("Segment STL files:", stlFiles);
//     segmentJob.newFiles = newFiles;
//     segmentJob.stlFiles = stlFiles;
//     segmentJob.percent = 100;
//     segmentJob.label = "Segment completed";
//     segmentJob.done = true;
//   } catch (err) {
//     segmentJob.error = err.message;
//     segmentJob.done = true;
//   } finally {
//     segmentJob.running = false;
//   }
// }



async function runSegmentJob() {
  const jaws = JAWS_TO_PROCESS;

  try {
    // exe call 1: Segment, ONE call for both jaws
    segmentJob.label = "Separating teeth and gum...";
    segmentJob.percent = 0;
    const newFiles = await runSegmentExe(jaws);

    // exe call 2: TeethNumber, ONE call for both jaws
    segmentJob.label = "Numbering the teeth...";
    segmentJob.percent = 50;
    const numberFiles = await newExe.runTeethNumber(jaws);
    segmentJob.numberFiles = numberFiles;

    // every STL file in the Output folders (gum and teeth) is sent to the browser
    const stlFiles = {};
    for (const jaw of jaws) {
      const { outputDir } = jawPaths(jaw);
      stlFiles[jaw] = fs
        .readdirSync(outputDir)
        .filter((f) => f.toLowerCase().endsWith(".stl"));
    }

    console.log("Segment STL files:", stlFiles);
    segmentJob.newFiles = newFiles;
    segmentJob.stlFiles = stlFiles;
    segmentJob.percent = 100;
    segmentJob.label = "Segment completed";
    segmentJob.done = true;
  } catch (err) {
    segmentJob.error = err.message;
    segmentJob.done = true;
  } finally {
    segmentJob.running = false;
  }
}

app.post("/api/segment-teeth", (req, res) => {
  if (segmentJob.running) {
    return res.status(409).json({ message: "Segment is already running" });
  }

  // the exe needs the Output folder (with the LAT csv files) of every jaw
  for (const jaw of JAWS_TO_PROCESS) {
    if (!fs.existsSync(jawPaths(jaw).outputDir)) {
      return res.status(400).json({ message: `Please run Identify LAT first (no Output folder for ${jaw} jaw)` });
    }
  }

  segmentJob = {
    running: true,
    done: false,
    percent: 0,
    label: "Starting...",
    error: null,
    newFiles: null,
    stlFiles: null,
    numberFiles: null,
  };

  runSegmentJob();
  res.json({ started: true });
});

app.get("/api/segment-teeth/status", (req, res) => {
  res.json(segmentJob);
});

// ---------------- Save an edited LAT curve ----------------
// Writes <jaw folder>\Output\<tooth>.csv (the original is kept once in Output\Original)
app.post("/api/save-lat", (req, res) => {
  const { jaw, id, csv } = req.body || {};

  if (jaw !== "upper" && jaw !== "lower") {
    return res.status(400).json({ message: "Invalid jaw" });
  }
  if (!/^\d{2}$/.test(String(id))) {
    return res.status(400).json({ message: "Invalid tooth number" });
  }
  if (typeof csv !== "string" || !csv.trim()) {
    return res.status(400).json({ message: "Empty csv" });
  }

  const { outputDir } = jawPaths(jaw);
  if (!fs.existsSync(outputDir)) {
    return res.status(400).json({ message: `Output folder not found for ${jaw} jaw` });
  }

  const filePath = path.join(outputDir, `${id}.csv`);

  // keep the original LAT file once, before the first overwrite
  const backupDir = path.join(outputDir, BACKUP_DIR_NAME);
  const backupPath = path.join(backupDir, `${id}.csv`);
  if (fs.existsSync(filePath) && !fs.existsSync(backupPath)) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(filePath, backupPath);
  }

  fs.writeFileSync(filePath, csv);
  res.json({ message: `Saved ${id}.csv` });
});


// ---------------- Clean Model button (CleanModel.exe, then the segmenter) ----------------
require("./cleanModel")(app, { runExe, jawPaths, runSegmenterExe, jaws: JAWS_TO_PROCESS });

// ---------------- Generate Trimline / Trim Model / Add Base (new GeometryKernel.exe) ----------------
// require("./newExe")(app, { runExe, jawPaths, jaws: JAWS_TO_PROCESS });

// const newExe = require("./newExe")(app, { runExe, jawPaths, jaws: JAWS_TO_PROCESS });

// const newExe = require("./newExe")(app, {
//   runExe,
//   jawPaths,
//   jaws: JAWS_TO_PROCESS,
//   exePath: GEOMETRY_KERNEL_EXE,
// });



const newExe = require("./newExe")(app, {
  runExe,
  jawPaths,
  jaws: JAWS_TO_PROCESS,
  exePath: GEOMETRY_KERNEL_EXE,
  workDir: EXE_WORK_DIR,
});

// ---------------- Save an edited trimline ----------------
// Overwrites the Trimline.csv that the exe made (the original is kept once in an "Original" folder next to it)
app.post("/api/save-trimline", (req, res) => {
  const { jaw, file, csv } = req.body || {};

  if (jaw !== "upper" && jaw !== "lower") {
    return res.status(400).json({ message: "Invalid jaw" });
  }
  if (typeof csv !== "string" || !csv.trim()) {
    return res.status(400).json({ message: "Empty csv" });
  }
  if (typeof file !== "string" || !/^trimline\.csv$/i.test(path.basename(file))) {
    return res.status(400).json({ message: "Invalid file" });
  }

  const { jawDir } = jawPaths(jaw);
  const filePath = path.resolve(jawDir, file);

  // the file must be inside the jaw folder
  if (!filePath.startsWith(path.resolve(jawDir) + path.sep)) {
    return res.status(400).json({ message: "Invalid file path" });
  }
  // if (!fs.existsSync(filePath)) {
  //   return res.status(400).json({ message: "" });
  // }

  // // keep the original file once, before the first overwrite
  // const backupDir = path.join(path.dirname(filePath), BACKUP_DIR_NAME);
  // const backupPath = path.join(backupDir, path.basename(filePath));
  // if (!fs.existsSync(backupPath)) {
  //   fs.mkdirSync(backupDir, { recursive: true });
  //   fs.copyFileSync(filePath, backupPath);
  // }

  // fs.writeFileSync(filePath, csv);
 // the folder may be gone (for example after the segmenter ran), so create it
fs.mkdirSync(path.dirname(filePath), { recursive: true });

// keep the original file once, before the first overwrite (only if it exists)
const backupDir = path.join(path.dirname(filePath), BACKUP_DIR_NAME);
const backupPath = path.join(backupDir, path.basename(filePath));
if (fs.existsSync(filePath) && !fs.existsSync(backupPath)) {
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(filePath, backupPath);
}

fs.writeFileSync(filePath, csv);


  res.json({ message: `Saved ${path.basename(filePath)}` });
});



// ---------------- Errors ----------------
app.use((err, req, res, next) => {
  res.status(400).json({ message: err.message });
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));