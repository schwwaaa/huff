use std::{env, fs, path::{Path, PathBuf}};

fn main() {
    #[cfg(target_os = "macos")]
    build_macos_camera();

    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        build_spout_windows();
    }

    tauri_build::build();
}

#[cfg(target_os = "macos")]
fn build_macos_camera() {
    cc::Build::new()
        .file("src/macos_camera.m")
        .flag("-fobjc-arc")
        .flag("-std=gnu11")
        .compile("junkpile_avfoundation_camera");

    println!("cargo:rustc-link-lib=framework=AVFoundation");
    println!("cargo:rustc-link-lib=framework=CoreMedia");
    println!("cargo:rustc-link-lib=framework=CoreVideo");
    println!("cargo:rustc-link-lib=framework=Foundation");
    println!("cargo:rerun-if-changed=src/macos_camera.m");
    println!("cargo:rerun-if-changed=frameworks/Syphon.framework");
}

fn build_spout_windows() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let bridge_dir = manifest_dir.join("native/spout_bridge");
    let spout2_dir = manifest_dir.join("native/spout2");
    if !bridge_dir.exists() || !spout2_dir.exists() {
        panic!("Spout SDK/bridge missing; Windows output cannot be built");
    }

    for filename in ["spout_bridge.cpp", "spout_bridge.h", "CMakeLists.txt"] {
        println!("cargo:rerun-if-changed={}", bridge_dir.join(filename).display());
    }
    println!("cargo:rerun-if-changed={}", spout2_dir.join("SPOUTSDK/SpoutDirectX/SpoutDX/SpoutDX.cpp").display());
    println!("cargo:rerun-if-changed={}", spout2_dir.join("SPOUTSDK/SpoutGL/SpoutDirectX.cpp").display());

    let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let cmake_profile = if profile.eq_ignore_ascii_case("release") {
        "Release"
    } else {
        "Debug"
    };
    let destination = cmake::Config::new(&bridge_dir)
        .define("SPOUT2_DIR", spout2_dir.to_string_lossy().to_string())
        .profile(cmake_profile)
        .build_target("spout_bridge")
        .build();

    let library = find_file(&destination, "spout_bridge.lib", 10)
        .unwrap_or_else(|| panic!("Spout static library missing under {}", destination.display()));
    let library_dir = library
        .parent()
        .expect("Spout library has no parent directory");
    println!("cargo:rustc-link-search=native={}", library_dir.display());
    println!("cargo:rustc-link-lib=static=spout_bridge");

    // Native libraries used by SpoutDX and the bridge. The project-specific
    // bridge is static, so there is no spout_bridge.dll to package.
    for library in [
        "opengl32", "kernel32", "user32", "gdi32", "winspool", "comdlg32",
        "comctl32", "advapi32", "shell32", "ole32", "oleaut32", "uuid",
        "odbc32", "odbccp32", "d3d9", "d3d11", "dxgi", "version", "winmm",
        "psapi",
    ] {
        println!("cargo:rustc-link-lib=dylib={library}");
    }
    println!("cargo:warning=[spout] statically linked bridge: {}", library.display());
}

fn find_file(root: &Path, filename: &str, depth: usize) -> Option<PathBuf> {
    if depth == 0 || !root.exists() {
        return None;
    }
    for entry in fs::read_dir(root).ok()?.flatten() {
        let path = entry.path();
        if path.is_file()
            && path
                .file_name()
                .map(|name| name.to_string_lossy().eq_ignore_ascii_case(filename))
                == Some(true)
        {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file(&path, filename, depth - 1) {
                return Some(found);
            }
        }
    }
    None
}
