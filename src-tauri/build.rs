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
        println!("cargo:warning=Spout SDK/bridge missing; Windows build will not link Spout output");
        return;
    }

    for filename in ["spout_bridge.cpp", "spout_bridge.h", "CMakeLists.txt"] {
        println!("cargo:rerun-if-changed={}", bridge_dir.join(filename).display());
    }

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

    let (library_dir, dll_path) = find_spout_artifacts(&destination)
        .unwrap_or_else(|| panic!("Spout bridge artifacts missing under {}", destination.display()));
    println!("cargo:rustc-link-search=native={}", library_dir.display());
    println!("cargo:rustc-link-lib=dylib=spout_bridge");

    // OUT_DIR works for both target/<profile> and target/<triple>/<profile>.
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR unavailable"));
    let executable_dir = out_dir
        .ancestors()
        .nth(3)
        .map(Path::to_path_buf)
        .expect("could not resolve Cargo executable directory");
    fs::create_dir_all(&executable_dir).expect("could not create Cargo output directory");
    let target_dll = executable_dir.join("spout_bridge.dll");
    fs::copy(&dll_path, &target_dll).unwrap_or_else(|error| {
        panic!(
            "could not copy {} to {}: {error}",
            dll_path.display(),
            target_dll.display()
        )
    });
    println!("cargo:warning=[spout] runtime DLL copied to {}", target_dll.display());
}

fn find_spout_artifacts(root: &Path) -> Option<(PathBuf, PathBuf)> {
    fn find(root: &Path, filename: &str, depth: usize) -> Option<PathBuf> {
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
                if let Some(found) = find(&path, filename, depth - 1) {
                    return Some(found);
                }
            }
        }
        None
    }

    let library = find(root, "spout_bridge.lib", 8)?;
    let dll = find(root, "spout_bridge.dll", 8)?;
    Some((library.parent()?.to_path_buf(), dll))
}
