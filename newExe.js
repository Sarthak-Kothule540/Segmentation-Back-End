const fs = require("fs");
const path = require("path");

// =====================================================================
// CONFIG for Generate Trimline / Trim Model / Add Base
// =====================================================================

// The new exe
const NEW_EXE = "C:/NewExe/Release/GeometryKernel.exe";

// button name sent by the app -> first argument of the exe
const COMMANDS = {
  GenerateTrimline: "GenerateTrimline",
  TrimModel: "TrimModel",
  AddBase: "AddBase",
  TeethNumber: "TeethNumber",
};

// text for the progress bar
const LABELS = {
  GenerateTrimline: "Generating trimline",
  TrimModel: "Trimming model",
  AddBase: "Adding base",
  TeethNumber: "Numbering teeth",
};

// the jaw text (3rd argument), same as for the other GeometryKernel.exe
const JAW_ARG = {
  upper: "upper",
  lower: "lower",
};



// the result file that each command creates (searched in the jaw folder, newest one wins)
const RESULT_FILES = {
  GenerateTrimline: /^trimline\.csv$/i,
  TrimModel: /^trimmodel\.stl$/i,
  AddBase: /withbase\.stl$/i,
  // TeethNumber: /\.csv$/i,
    TeethNumber: /toothline\.csv$/i,
};

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

// newest file in a folder (also in sub-folders) whose name matches the pattern.
// Returns the path relative to the folder (with forward slashes), or null.
function findNewestFile(dir, pattern, base = dir, best = { time: 0, rel: null }) {
  if (!fs.existsSync(dir)) return best.rel;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findNewestFile(full, pattern, base, best);
    } else if (pattern.test(entry.name)) {
      const time = fs.statSync(full).mtimeMs;
      if (time > best.time) {
        best.time = time;
        best.rel = path.relative(base, full).split(path.sep).join("/");
      }
    }
  }
  return best.rel;
}











module.exports = function registerNewExe(app, { runExe, jawPaths, jaws }) {
  // the browser reads this status every second to fill the progress bar
  // let job = { running: false, done: false, percent: 0, label: "", error: null, report: null };
    let job = { running: false, done: false, percent: 0, label: "", error: null, report: null, files: null };

  // GeometryKernel.exe <command> <jaw folder ending with \> <jaw text>
  // async function runNewExeForJaw(commandKey, jaw) {
  //   const { jawDir } = jawPaths(jaw);

  //   const before = snapshotFiles(jawDir);

  //   const args = [COMMANDS[commandKey], jawDir, JAW_ARG[jaw]];
  //   await runExe(NEW_EXE, args, `${jaw} ${COMMANDS[commandKey]}`);

  //   const after = snapshotFiles(jawDir);
  //   const created = Object.keys(after).filter((f) => !(f in before));
  //   const changed = Object.keys(after).filter((f) => f in before && after[f] !== before[f]);

  //   console.log(`[${jaw} ${COMMANDS[commandKey]}] new files:`, created);
  //   console.log(`[${jaw} ${COMMANDS[commandKey]}] changed (overwritten) files:`, changed);

  //   return { created, changed };
  // }


     // GeometryKernel.exe <command> <jaw folder ending with \> <jaw text>
  async function runNewExeForJaw(commandKey, jaw) {
    const { jawDir } = jawPaths(jaw);
    const tag = `${jaw} ${COMMANDS[commandKey]}`;

    const before = snapshotFiles(jawDir);

    const args = [COMMANDS[commandKey], jawDir, JAW_ARG[jaw]];

    // the exe may return an error code (1) even when it did its work,
    // so the error is kept and checked after we look at the result files
    let failure = null;
    try {
      await runExe(NEW_EXE, args, tag);
    } catch (err) {
      failure = err;
    }

    const after = snapshotFiles(jawDir);
    const created = Object.keys(after).filter((f) => !(f in before));
    const changed = Object.keys(after).filter((f) => f in before && after[f] !== before[f]);

    console.log(`[${tag}] new files:`, created);
    console.log(`[${tag}] changed (overwritten) files:`, changed);

    if (failure) {
      // accepted only if the result file of this command was really written
      const madeResult = [...created, ...changed].some((f) =>
        RESULT_FILES[commandKey].test(path.basename(f))
      );
      if (!madeResult) throw failure;

      console.warn(`[${tag}] the exe returned an error code, but its result file exists, so it is accepted.`);
      console.warn(`[${tag}] ${failure.message}`);
    }

    return { created, changed };
  }





  async function runJob(commandKey) {
    let finished = 0;

    try {
      const report = {};

      for (const jaw of jaws) {
        const { inputFile } = jawPaths(jaw);
        if (!fs.existsSync(inputFile)) {
          throw new Error(`${jaw} scan is not uploaded`);
        }

        job.label = `${LABELS[commandKey]} for ${jaw} jaw...`;
        job.percent = Math.round((finished / jaws.length) * 100);

        report[jaw] = await runNewExeForJaw(commandKey, jaw);
        finished++;
      }

           // the result file of each jaw, sent to the browser so it can show it
      const files = {};
      for (const jaw of jaws) {
        const { jawDir } = jawPaths(jaw);
        files[jaw] = findNewestFile(jawDir, RESULT_FILES[commandKey]);
      }
      job.files = files;



      job.report = report;
      job.percent = 100;
      job.label = `${LABELS[commandKey]} completed`;
      job.done = true;
    } catch (err) {
      job.error = err.message;
      job.done = true;
    } finally {
      job.running = false;
    }
  }

  // start the job: POST /api/new-exe/GenerateTrimline  (or TrimModel, AddBase)
  app.post("/api/new-exe/:command", (req, res) => {
    const commandKey = req.params.command;

    if (!COMMANDS[commandKey]) {
      return res.status(400).json({ message: `Unknown command: ${commandKey}` });
    }
    if (job.running) {
      return res.status(409).json({ message: "Another operation is already running" });
    }

    // job = { running: true, done: false, percent: 0, label: "Starting...", error: null, report: null };
        job = { running: true, done: false, percent: 0, label: "Starting...", error: null, report: null, files: null };

    runJob(commandKey);
    res.json({ started: true });
  });

  // the browser asks this every second
  app.get("/api/new-exe/status", (req, res) => {
    res.json(job);
  });

  // used by the Segment button (server.js): runs the TeethNumber command for one jaw
  // and returns the csv files that the exe created or changed (paths relative to the jaw folder)
  return {
    async runTeethNumber(jaw) {
      const { created, changed } = await runNewExeForJaw("TeethNumber", jaw);
      return [...created, ...changed]
        // .filter((f) => f.toLowerCase().endsWith(".csv"))
           .filter((f) => /toothline\.csv$/i.test(f))
        .map((f) => f.split(path.sep).join("/"));
    },
  };

};