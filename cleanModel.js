const fs = require("fs");
const path = require("path");

// =====================================================================
// CONFIG for the Clean Model button
// =====================================================================

// Exe 1 of this button
const CLEAN_EXE = "C:/CleanModel/CleanModel.exe";

// Where CleanModel.exe writes the cleaned scan: next to the scan, NOT inside Output,
// because the segmenter deletes the Output folder before it runs.
// Upper.stl -> Upper_clean.stl
function cleanedFilePath(inputFile) {
  const { dir, name } = path.parse(inputFile);
  return path.join(dir, `${name}_clean.stl`);
}

// The original scan is kept once under this name: Upper.stl -> Upper_original.stl
function backupFilePath(inputFile) {
  const { dir, name } = path.parse(inputFile);
  return path.join(dir, `${name}_original.stl`);
}

// CleanModel.exe <input> <output>
// 
//   "--tunnel-width", "1.5"    widest gap (mm) closed as a tunnel
//   "--max-hole", "20"         largest hole perimeter (mm) to fill
//   "--no-tunnels", "--no-holes", "--keep-pieces"
function getCleanArgs(jaw, inputFile, cleanedFile) {
  return [inputFile, cleanedFile];
}

// =====================================================================

// Registers the routes of the Clean Model button.
// Exe 2 of this button is the segmenter that already exists (runSegmenterExe).
module.exports = function registerCleanModel(app, { runExe, 
    jawPaths, runSegmenterExe, jaws }) {
  // the browser reads this status every second to fill the progress bar
//   let job = { running: false, done: false, percent: 0, label: "", error: null };
  let job = { running: false, done: false, percent: 0, label: "", error: null, stlFiles: null };

  async function runCleanModelJob() {
    const totalSteps = jaws.length * 2; // clean + segment for each jaw
    let finished = 0;

    const percent = () => Math.round((finished / totalSteps) * 100);

    try {
      for (const jaw of jaws) {
        const { inputFile } = jawPaths(jaw);

        if (!fs.existsSync(inputFile)) {
          throw new Error(`${jaw} scan is not uploaded`);
        }

        // ----- Exe 1: CleanModel.exe -----
        job.label = `Cleaning ${jaw} jaw...`;
        job.percent = percent();

        const cleanedFile = cleanedFilePath(inputFile);
        fs.rmSync(cleanedFile, { force: true }); // remove an old result
        console.time(`${jaw} CleanModel.exe`);

        await runExe(CLEAN_EXE, getCleanArgs(jaw, inputFile, cleanedFile), `${jaw} clean`);

        console.timeEnd(`${jaw} CleanModel.exe`);

        if (!fs.existsSync(cleanedFile)) {
          throw new Error(`CleanModel.exe did not create ${path.basename(cleanedFile)} for ${jaw} jaw`);
        }

        // keep the original scan once, then use the cleaned scan from now on
        const backupFile = backupFilePath(inputFile);
        if (!fs.existsSync(backupFile)) {
          fs.copyFileSync(inputFile, backupFile);
        }
        fs.copyFileSync(cleanedFile, inputFile);
        finished++;

        // ----- Exe 2: AutomaticTeethSegmenter.exe (the same function as Identify LAT uses) -----
        job.label = `Segmenting ${jaw} jaw...`;
        job.percent = percent();
        console.time(`${jaw} Segmenter.exe`);

        await runSegmenterExe(jaw);
        console.timeEnd(`${jaw} Segmenter.exe`);
        finished++;
      }


            // every STL file in the Output folders (gum and teeth) is sent to the browser
      const stlFiles = {};
      for (const jaw of jaws) {
        const { outputDir } = jawPaths(jaw);
        stlFiles[jaw] = fs
          .readdirSync(outputDir)
          .filter((f) => f.toLowerCase().endsWith(".stl"));
      }
      job.stlFiles = stlFiles;

      job.percent = 100;
      job.label = "Clean Model completed";
      job.done = true;
    } catch (err) {
      job.error = err.message;
      job.done = true;
    } finally {
      job.running = false;
    }
  }

  // start the job and answer immediately
  app.post("/api/clean-model", (req, res) => {
    if (job.running) {
      return res.status(409).json({ message: "Clean Model is already running" });
    }

    // job = { running: true, done: false, percent: 0, label: "Starting...", error: null };
        job = { running: true, done: false, percent: 0, label: "Starting...", error: null, stlFiles: null };

    runCleanModelJob();
    res.json({ started: true });
  });

  // the browser asks this every second
  app.get("/api/clean-model/status", (req, res) => {
    res.json(job);
  });
};