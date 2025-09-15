rm -rf node_modules package-lock.json
npm cache clean --force
npm i -D @tauri-apps/cli@latest @tauri-apps/cli-darwin-arm64@latest
npm i
npm run tauri dev