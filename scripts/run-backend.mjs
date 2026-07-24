import { spawn } from "node:child_process";

const backend = process.argv[2];
const supported = new Set(["metal", "vulkan", "dx12", "gl"]);

if (!supported.has(backend)) {
  console.error(`Unknown backend: ${backend ?? "(missing)"}`);
  process.exit(2);
}

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(executable, ["tauri", "dev"], {
  stdio: "inherit",
  env: {
    ...process.env,
    WGPU_BACKEND: backend
  }
});

child.on("error", (error) => {
  console.error(`Could not start Tauri: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Tauri exited from signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
