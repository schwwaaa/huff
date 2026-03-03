#!/usr/bin/env node

const { execSync } = require("child_process");

function run(cmd) {
  console.log("→", cmd);
  execSync(cmd, { stdio: "inherit" });
}

try {
  // Always just build for the current platform.
  // Tauri will produce the right bundle for Windows/mac/Linux automatically.
  run("npx tauri build");
} catch (err) {
  console.error("✖ tauri build failed");
  if (err && err.stdout) console.error(String(err.stdout));
  if (err && err.stderr) console.error(String(err.stderr));
  process.exit(err.status || 1);
}