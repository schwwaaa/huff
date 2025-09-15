# add both mac targets
rustup target add aarch64-apple-darwin x86_64-apple-darwin

# build each arch (skip DMG to avoid your earlier bundler error)
npm run tauri build -- --target aarch64-apple-darwin --bundles app
npm run tauri build -- --target x86_64-apple-darwin --bundles app
