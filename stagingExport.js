const fs = require("fs");
const path = require("path");

// =====================================================================
// CONFIG
// =====================================================================
const STAGING_DIR = "D:/Temp/Staging Data";
const INITIAL_DIR_NAME = "Initial Data";
const FINAL_DIR_NAME = "Final Position Data";

// Where Automatic Setup writes its result (same as in automaticSetup.js)
const AUTOMATIC_SETUP_OUTPUT_DIR = "D:/Temp/uploads/AutomaticSetupOutput";

// Files in <jaw>\Output that must NOT go into Initial Data.
// The Output folder is shared with GeometryKernel, so skip its files here.
const EXCLUDE_FROM_INITIAL = [
  /^\d{2}\.csv$/i,        // LAT curves (11.csv, 12.csv ...)
  /^trimline/i,           // trimline files
  /^modelwithbase/i,      // Add Base result
  /^original$/i,          // backup folder of edited LAT files
];
// =====================================================================

module.exports = function registerStagingExport(app, { jawPaths, jaws }) {
  app.get("/api/export-staging", (req, res) => {
    try {
      // start clean, so old files are never mixed with the new ones
      fs.rmSync(STAGING_DIR, { recursive: true, force: true });

      const initialRoot = path.join(STAGING_DIR, INITIAL_DIR_NAME);
      const finalRoot = path.join(STAGING_DIR, FINAL_DIR_NAME);
      const copied = { initial: {}, final: {} };

      for (const jaw of jaws) {
        // ---- Initial Data: segmenter output of this jaw ----
        const src = jawPaths(jaw).outputDir;
        const dest = path.join(initialRoot, jaw);
        if (!fs.existsSync(src)) throw new Error(`No segmenter output for ${jaw} jaw. Run Identify LAT / Clean Model first.`);

        fs.mkdirSync(dest, { recursive: true });
        copied.initial[jaw] = [];
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
          if (EXCLUDE_FROM_INITIAL.some((re) => re.test(entry.name))) continue;
          fs.cpSync(path.join(src, entry.name), path.join(dest, entry.name), { recursive: true });
          copied.initial[jaw].push(entry.name);
        }

        // ---- Final Position Data: Automatic Setup output of this jaw ----
        const setupSrc = path.join(AUTOMATIC_SETUP_OUTPUT_DIR, jaw);
        if (!fs.existsSync(setupSrc)) throw new Error(`No Automatic Setup output for ${jaw} jaw. Run Automatic Setup first.`);

        fs.cpSync(setupSrc, path.join(finalRoot, jaw), { recursive: true });
        copied.final[jaw] = fs.readdirSync(setupSrc);
      }

      console.log("[Staging] copied:", JSON.stringify(copied, null, 2));
      res.json({ message: `Staging data created in ${STAGING_DIR}`, copied });
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  });
};