rustup target add aarch64-apple-darwin x86_64-apple-darwin

npm run tauri build -- --target aarch64-apple-darwin --bundles app
npm run tauri build -- --target x86_64-apple-darwin --bundles app
