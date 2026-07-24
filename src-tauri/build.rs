fn main() {
    #[cfg(target_os = "macos")]
    {
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
    }
    tauri_build::build();
}
