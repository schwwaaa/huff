// src-tauri/build.rs
//
// macOS  → Syphon.framework bundled in src-tauri/frameworks/ and declared in
//          tauri.conf.json bundle.macOS.frameworks — Tauri handles linking.
//          Nothing extra needed here.
//
// Windows → Build native/spout_bridge via CMake (compiles Spout2 + C-ABI DLL),
//            link the import library, copy spout_bridge.dll next to the exe.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    if target_os == "macos" {
        validate_syphon_framework();
    }

    tauri_build::build();

    if target_os == "windows" {
        build_spout_windows();
    }
}

fn src_tauri_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}


fn validate_syphon_framework() {
    let framework = src_tauri_dir().join("frameworks/Syphon.framework");
    let versioned_binary = framework.join("Versions/A/Syphon");
    let root_binary = framework.join("Syphon");

    println!("cargo:rerun-if-changed={}", framework.display());

    if !framework.is_dir() {
        panic!(
            "HUFF Classic requires bundled Syphon.framework at {}",
            framework.display()
        );
    }

    if !versioned_binary.is_file() && !root_binary.is_file() {
        panic!(
            "Syphon.framework is incomplete: expected {} or {}",
            versioned_binary.display(),
            root_binary.display()
        );
    }
}

fn build_spout_windows() {
    let src_tauri  = src_tauri_dir();
    let bridge_dir = src_tauri.join("native/spout_bridge");
    let spout2_dir = src_tauri.join("native/spout2");

    if !bridge_dir.exists() {
        println!("cargo:warning=spout_bridge not found — building WITHOUT Spout support.");
        return;
    }
    if !spout2_dir.exists() {
        println!("cargo:warning=spout2 SDK not found — building WITHOUT Spout support.");
        return;
    }

    println!("cargo:rerun-if-changed={}", bridge_dir.join("spout_bridge.cpp").display());
    println!("cargo:rerun-if-changed={}", bridge_dir.join("spout_bridge.h").display());
    println!("cargo:rerun-if-changed={}", bridge_dir.join("CMakeLists.txt").display());

    let profile          = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let cmake_build_type = if profile.eq_ignore_ascii_case("release") { "Release" } else { "Debug" };

    let dst = cmake::Config::new(&bridge_dir)
        .define("SPOUT2_DIR", spout2_dir.to_string_lossy().to_string())
        .profile(cmake_build_type)
        .build_target("spout_bridge")
        .build();

    let (lib_dir, dll_path) = find_spout_artifacts(&dst)
        .unwrap_or_else(|| panic!("Could not find spout_bridge.lib / .dll under {}", dst.display()));

    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=dylib=spout_bridge");

    // Copy DLL next to exe so cargo run and tauri dev work
    let target_dir = env::var("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| src_tauri_dir().join("target"));
    let exe_dir = target_dir.join(&profile);
    fs::create_dir_all(&exe_dir).expect("create target dir");
    let dest = exe_dir.join("spout_bridge.dll");
    fs::copy(&dll_path, &dest)
        .unwrap_or_else(|e| panic!("copy {} -> {}: {e}", dll_path.display(), dest.display()));
    println!("cargo:warning=[spout] spout_bridge.dll -> {}", dest.display());
}

fn find_spout_artifacts(dst: &Path) -> Option<(PathBuf, PathBuf)> {
    fn find_file(root: &Path, name: &str, depth: usize) -> Option<PathBuf> {
        if depth == 0 || !root.exists() { return None; }
        for e in fs::read_dir(root).ok()?.flatten() {
            let p = e.path();
            if p.is_file() {
                if p.file_name().map(|s| s.to_string_lossy().eq_ignore_ascii_case(name)) == Some(true) {
                    return Some(p);
                }
            } else if p.is_dir() {
                if let Some(f) = find_file(&p, name, depth - 1) { return Some(f); }
            }
        }
        None
    }
    let lib = find_file(dst, "spout_bridge.lib", 8)?;
    let dll = find_file(dst, "spout_bridge.dll", 8)?;
    Some((lib.parent()?.to_path_buf(), dll))
}
