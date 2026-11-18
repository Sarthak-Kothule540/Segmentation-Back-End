// const fs = require("fs");
// const path = require("path");

// // =====================================================================
// // CONFIG for the Automatic Setup button
// // =====================================================================
// const AUTOMATIC_SETUP_EXE = "C:/AutomaticSetup/AutomaticSetup.exe";


// // the option that sets the output folder: copy the real name from "AutomaticSetup.exe --help"
// const OUTPUT_OPTION = "--output"; // placeholder, confirm it

// // argument 2: the folder for the output
// const AUTOMATIC_SETUP_OUTPUT_DIR = "D:/Temp/uploads/AutomaticSetupOutput";
// // =====================================================================

// // every file in a folder (also in sub-folders) with its size and last-change time
// function snapshotFiles(dir, base = dir, result = {}) {
//   if (!fs.existsSync(dir)) return result;
//   for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
//     const full = path.join(dir, entry.name);
//     if (entry.isDirectory()) {
//       snapshotFiles(full, base, result);
//     } else {
//       const st = fs.statSync(full);
//       result[path.relative(base, full)] = `${st.size}-${st.mtimeMs}`;
//     }
//   }
//   return result;
// }

// module.exports = function registerAutomaticSetup(app, { runExe, jawPaths, jaws }) {
//   // the browser reads this status every second to fill the progress bar
//   let job = { running: false, done: false, percent: 0, label: "", error: null, files: null, outputDir: null };

//   async function runAutomaticSetupJob() {
//     try {
//       // the segmented teeth must exist (the Segment button makes them)
//       for (const jaw of jaws) {
//         const { outputDir } = jawPaths(jaw);
//         const hasStl =
//           fs.existsSync(outputDir) &&
//           fs.readdirSync(outputDir).some((f) => f.toLowerCase().endsWith(".stl"));
//         if (!hasStl) throw new Error(`Please run Segment first (no segmented teeth for ${jaw} jaw)`);
//       }

//       // the output folder must exist
//       fs.mkdirSync(AUTOMATIC_SETUP_OUTPUT_DIR, { recursive: true });
//       const before = snapshotFiles(AUTOMATIC_SETUP_OUTPUT_DIR);

//       // one call per jaw: input = the Output folder with the segmented teeth of that jaw
// let failure = null;
// let finished = 0;
// for (const jaw of jaws) {
//   job.label = `Running Automatic Setup for ${jaw} jaw...`;
//   job.percent = Math.round((finished / jaws.length) * 100);

//   const inputDir = jawPaths(jaw).outputDir; // D:\Temp\uploads\upper\Output
//   const jawOutputDir = path.join(AUTOMATIC_SETUP_OUTPUT_DIR, jaw); // ...\AutomaticSetupOutput\upper
// //   fs.mkdirSync(jawOutputDir, { recursive: true });
// fs.rmSync(jawOutputDir, { recursive: true, force: true }); // remove the old result of this jaw
// fs.mkdirSync(jawOutputDir, { recursive: true });

//   try {
//     await runExe(
//       AUTOMATIC_SETUP_EXE,
//       [inputDir, OUTPUT_OPTION, jawOutputDir],
//       `${jaw} AutomaticSetup`
//     );
//   } catch (err) {
//     failure = failure || err; // keep the first error and continue with the other jaw
//   }
//   finished++;
// }

//       const after = snapshotFiles(AUTOMATIC_SETUP_OUTPUT_DIR);
//       const files = Object.keys(after)
//         .filter((f) => !(f in before) || after[f] !== before[f])
//         .map((f) => f.split(path.sep).join("/"));

//       console.log("[AutomaticSetup] output files created or changed:", files);

//       if (failure) {
//         if (files.length === 0) throw failure; // a real failure: no output
//         console.warn("[AutomaticSetup] the exe returned an error code, but the output files exist, so it is accepted.");
//       }

//       job.files = files;
//       job.outputDir = AUTOMATIC_SETUP_OUTPUT_DIR;
//       job.percent = 100;
//       job.label = "Automatic Setup completed";
//       job.done = true;
//     } catch (err) {
//       job.error = err.message;
//       job.done = true;
//     } finally {
//       job.running = false;
//     }
//   }

//   // start the job and answer immediately
//   app.post("/api/automatic-setup", (req, res) => {
//     if (job.running) {
//       return res.status(409).json({ message: "Automatic Setup is already running" });
//     }

//     job = { running: true, done: false, percent: 0, label: "Starting...", error: null, files: null, outputDir: null };

//     runAutomaticSetupJob();
//     res.json({ started: true });
//   });

//   // the browser asks this every second
//   app.get("/api/automatic-setup/status", (req, res) => {
//     res.json(job);
//   });
// };



const fs = require("fs");
const path = require("path");

// =====================================================================
// CONFIG for the Automatic Setup button
// =====================================================================
const AUTOMATIC_SETUP_EXE = "C:/AutomaticSetup/AutomaticSetup.exe";
const OUTPUT_OPTION = "--output"; // confirm with "AutomaticSetup.exe --help"

// one input folder and one output folder for BOTH jaws
const AUTOMATIC_SETUP_INPUT_DIR = "D:/Temp/AutomaticSetupInput";
const AUTOMATIC_SETUP_OUTPUT_DIR = "D:/Temp/AutomaticSetupOutput";
// =====================================================================

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

module.exports = function registerAutomaticSetup(app, { runExe, jawPaths, jaws }) {
  let job = { running: false, done: false, percent: 0, label: "", error: null, files: null, outputDir: null };

  async function runAutomaticSetupJob() {
    try {
      // 1. the segmented files must exist (the Segment button makes them)
      for (const jaw of jaws) {
        const { outputDir } = jawPaths(jaw);
        const hasStl =
          fs.existsSync(outputDir) &&
          fs.readdirSync(outputDir).some((f) => f.toLowerCase().endsWith(".stl"));
        if (!hasStl) throw new Error(`Please run Segment first (no segmented teeth for ${jaw} jaw)`);
      }

      // 2. start with clean input and output folders
      fs.rmSync(AUTOMATIC_SETUP_INPUT_DIR, { recursive: true, force: true });
      fs.rmSync(AUTOMATIC_SETUP_OUTPUT_DIR, { recursive: true, force: true });
      fs.mkdirSync(AUTOMATIC_SETUP_INPUT_DIR, { recursive: true });
      fs.mkdirSync(AUTOMATIC_SETUP_OUTPUT_DIR, { recursive: true });

      // 3. copy the segmented files of each jaw into Input\<jaw>\
      // job.label = "Preparing input files...";
      // job.percent = 5;
      // for (const jaw of jaws) {
      //   const { outputDir } = jawPaths(jaw);
      //   const target = path.join(AUTOMATIC_SETUP_INPUT_DIR, jaw);
      //   fs.mkdirSync(target, { recursive: true });
      //   for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
      //     if (!entry.isFile()) continue; // skips the "Original" backup folder
      //     fs.copyFileSync(path.join(outputDir, entry.name), path.join(target, entry.name));
      //   }
      // }

            // 3. copy ONLY the tooth files (11.stl, 12.stl, ...) of both jaws into ONE flat folder
      job.label = "Preparing input files...";
      job.percent = 5;
      let copied = 0;
      for (const jaw of jaws) {
        const { outputDir } = jawPaths(jaw);
        for (const name of fs.readdirSync(outputDir)) {
          if (!/^\d{2}\.stl$/i.test(name)) continue; // skips Gum.stl, ModelWithBase.stl, csv files
          fs.copyFileSync(path.join(outputDir, name), path.join(AUTOMATIC_SETUP_INPUT_DIR, name));
          copied++;
        }
      }
      console.log(`[AutomaticSetup] copied ${copied} tooth files into the input folder`);
      if (copied < 2) throw new Error("Not enough segmented teeth found. Please run Segment first.");


      // 4. run the exe ONCE for both jaws
      job.label = "Running Automatic Setup...";
      job.percent = 20;
      const before = snapshotFiles(AUTOMATIC_SETUP_OUTPUT_DIR);

      let failure = null;
      try {
        await runExe(
          AUTOMATIC_SETUP_EXE,
          [AUTOMATIC_SETUP_INPUT_DIR, OUTPUT_OPTION, AUTOMATIC_SETUP_OUTPUT_DIR],
          "AutomaticSetup"
        );
      } catch (err) {
        failure = err;
      }

      const after = snapshotFiles(AUTOMATIC_SETUP_OUTPUT_DIR);
      const files = Object.keys(after)
        .filter((f) => !(f in before) || after[f] !== before[f])
        .map((f) => f.split(path.sep).join("/"));

      console.log("[AutomaticSetup] output files created or changed:", files);

      if (failure) {
        if (files.length === 0) throw failure; // a real failure: no output
        console.warn("[AutomaticSetup] the exe returned an error code, but the output files exist, so it is accepted.");
      }

      job.files = files;
      job.outputDir = AUTOMATIC_SETUP_OUTPUT_DIR;
      job.percent = 100;
      job.label = "Automatic Setup completed";
      job.done = true;
    } catch (err) {
      job.error = err.message;
      job.done = true;
    } finally {
      job.running = false;
    }
  }

  app.post("/api/automatic-setup", (req, res) => {
    if (job.running) {
      return res.status(409).json({ message: "Automatic Setup is already running" });
    }
    job = { running: true, done: false, percent: 0, label: "Starting...", error: null, files: null, outputDir: null };
    runAutomaticSetupJob();
    res.json({ started: true });
  });

  app.get("/api/automatic-setup/status", (req, res) => {
    res.json(job);
  });
};