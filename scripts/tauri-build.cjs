#!/usr/bin/env node

const { spawnSync } = require("child_process");
const os = require("os");

const platform = os.platform();

let args;

if (platform === "darwin") {
  // macOS ONLY
  console.log("→ macOS detected: building UNIVERSAL app bundle");
  args = [
    "tauri",
    "build",
    "--target",
    "universal-apple-darwin",
    "--bundles",
    "app"
  ];
} else if (platform === "win32") {
  // Windows ONLY
  console.log("→ Windows detected: building normal Windows bundle");
  args = ["tauri", "build"];
} else {
  // Linux or other
  console.log("→ Other platform detected: running default tauri build");
  args = ["tauri", "build"];
}

const cmd = platform === "win32" ? "npx.cmd" : "npx";

const result = spawnSync(cmd, args, {
  stdio: "inherit",
  env: process.env
});

process.exit(result.status === null || result.status === undefined ? 1 : result.status);