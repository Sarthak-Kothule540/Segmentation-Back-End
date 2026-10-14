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
};

// text for the progress bar
const LABELS = {
  GenerateTrimline: "Generating trimline",
  TrimModel: "Trimming model",
  AddBase: "Adding base",
};

// the jaw text (3rd argument), same as for the other GeometryKernel.exe
const JAW_ARG = {
  upper: "upper",
  lower: "lower",
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

module.exports = function registerNewExe(app, { runExe, jawPaths, jaws }) {
  // the browser reads this status every second to fill the progress bar
  let job = { running: false, done: false, percent: 0, label: "", error: null, report: null };

  // GeometryKernel.exe <command> <jaw folder ending with \> <jaw text>
  async function runNewExeForJaw(commandKey, jaw) {
    const { jawDir } = jawPaths(jaw);

    const before = snapshotFiles(jawDir);

    const args = [COMMANDS[commandKey], jawDir, JAW_ARG[jaw]];
    await runExe(NEW_EXE, args, `${jaw} ${COMMANDS[commandKey]}`);

    const after = snapshotFiles(jawDir);
    const created = Object.keys(after).filter((f) => !(f in before));
    const changed = Object.keys(after).filter((f) => f in before && after[f] !== before[f]);

    console.log(`[${jaw} ${COMMANDS[commandKey]}] new files:`, created);
    console.log(`[${jaw} ${COMMANDS[commandKey]}] changed (overwritten) files:`, changed);

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

    job = { running: true, done: false, percent: 0, label: "Starting...", error: null, report: null };

    runJob(commandKey);
    res.json({ started: true });
  });

  // the browser asks this every second
  app.get("/api/new-exe/status", (req, res) => {
    res.json(job);
  });
};