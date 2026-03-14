// src-tauri/src/recording.rs
// Tauri v1 commands for saving huff canvas output to disk.
//
// save_single_frame       — native Save dialog → one JPEG
// save_recording          — native Save dialog → one ZIP archive
// save_recording_sequence — native Pick-folder dialog → numbered JPEGs
// save_recording_video    — encode via bundled FFmpeg sidecar → MP4 or MOV

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{command, AppHandle};
use tauri::api::dialog::blocking::FileDialogBuilder;
use zip::write::{FileOptions, ZipWriter};
use zip::CompressionMethod;

// ── Single frame snapshot ─────────────────────────────────────────────────────

#[command]
pub async fn save_single_frame(
    _app: AppHandle,
    data: Vec<u8>,
    filename: String,
) -> Result<String, String> {
    let stem = stem_of(&filename, "huff-snapshot");

    let path = FileDialogBuilder::new()
        .set_title("Save Snapshot")
        .set_file_name(&format!("{stem}.jpg"))
        .add_filter("JPEG image", &["jpg", "jpeg"])
        .save_file();

    let path = match path {
        Some(p) => p,
        None    => return Ok(String::new()),
    };

    fs::write(&path, &data).map_err(|e| format!("Write failed: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

// ── Multi-frame recording → ZIP ───────────────────────────────────────────────

#[command]
pub async fn save_recording(
    _app: AppHandle,
    frames: Vec<Vec<u8>>,
    archive_name: String,
) -> Result<String, String> {
    if frames.is_empty() {
        return Err("No frames to save.".into());
    }

    let stem = stem_of(&archive_name, "huff-recording");

    let path = FileDialogBuilder::new()
        .set_title("Save Recording")
        .set_file_name(&format!("{stem}.zip"))
        .add_filter("ZIP archive", &["zip"])
        .save_file();

    let path = match path {
        Some(p) => p,
        None    => return Ok(String::new()),
    };

    write_zip(&path, &frames)?;
    Ok(path.to_string_lossy().into_owned())
}

// ── Multi-frame recording → image sequence ───────────────────────────────────

#[command]
pub async fn save_recording_sequence(
    _app: AppHandle,
    frames: Vec<Vec<u8>>,
    folder_name: String,
) -> Result<String, String> {
    if frames.is_empty() {
        return Err("No frames to save.".into());
    }

    let parent = FileDialogBuilder::new()
        .set_title("Choose folder for image sequence")
        .pick_folder();

    let parent = match parent {
        Some(p) => p,
        None    => return Ok(String::new()),
    };

    let safe_name = sanitize_folder(&folder_name, "huff-seq");
    let folder = parent.join(safe_name);
    fs::create_dir_all(&folder).map_err(|e| format!("mkdir failed: {e}"))?;

    let pad = digits_needed(frames.len());
    for (i, frame) in frames.iter().enumerate() {
        let fname = format!("frame_{:0>pad$}.jpg", i + 1, pad = pad);
        fs::write(folder.join(&fname), frame)
            .map_err(|e| format!("Write frame {i} failed: {e}"))?;
    }

    Ok(folder.to_string_lossy().into_owned())
}

// ── Video encoding via bundled FFmpeg sidecar ─────────────────────────────────
//
// Tauri resolves "bin/ffmpeg" to the correct platform binary automatically:
//   bin/ffmpeg-aarch64-apple-darwin      (macOS Apple Silicon)
//   bin/ffmpeg-x86_64-apple-darwin       (macOS Intel)
//   bin/ffmpeg-x86_64-pc-windows-msvc.exe (Windows)
//
// Run scripts/download-ffmpeg.sh (macOS) or scripts/download-ffmpeg.cmd
// (Windows) once before building to place those binaries in src-tauri/binaries/.

#[command]
pub async fn save_recording_video(
    app: AppHandle,
    frames: Vec<Vec<u8>>,
    fps: u32,
    format: String,
    suggested_name: String,
) -> Result<String, String> {
    if frames.is_empty() {
        return Err("No frames to save.".into());
    }

    let fps = fps.max(1).min(120);

    // ── Write frames to a temp directory ─────────────────────────────────────
    let tmp = std::env::temp_dir().join(format!("huff-enc-{}", timestamp_name("t")));
    fs::create_dir_all(&tmp).map_err(|e| format!("Temp dir: {e}"))?;

    let pad = digits_needed(frames.len());
    for (i, frame) in frames.iter().enumerate() {
        let fname = format!("frame_{:0>pad$}.jpg", i + 1, pad = pad);
        fs::write(tmp.join(&fname), frame)
            .map_err(|e| format!("Write frame {i}: {e}"))?;
    }

    // ── Encode via sidecar ────────────────────────────────────────────────────
    let ext = if format == "mov" { "mov" } else { "mp4" };
    let tmp_out = tmp.join(format!("output.{ext}"));
    // Frames are named frame_0001.jpg, frame_0002.jpg … starting at 1
    let pattern = format!("frame_%0{}d.jpg", pad);
    let pattern_path = tmp.join(&pattern);

    let ffmpeg_args = vec![
        "-y".to_string(),
        "-framerate".to_string(), fps.to_string(),
        "-start_number".to_string(), "1".to_string(),
        "-i".to_string(), pattern_path.to_string_lossy().into_owned(),
        "-c:v".to_string(), "libx264".to_string(),
        "-pix_fmt".to_string(), "yuv420p".to_string(),
        "-movflags".to_string(), "+faststart".to_string(),
        tmp_out.to_string_lossy().into_owned(),
    ];

    let output = tauri::api::process::Command::new_sidecar("ffmpeg")
        .map_err(|e| format!("Sidecar not found — run scripts/download-ffmpeg.sh first.\nDetail: {e}"))?
        .args(&ffmpeg_args)
        .output()
        .map_err(|e| { let _ = fs::remove_dir_all(&tmp); format!("FFmpeg launch failed: {e}") })?;

    if !output.status.success() {
        let _ = fs::remove_dir_all(&tmp);
        let tail = if output.stderr.len() > 600 { &output.stderr[output.stderr.len()-600..] } else { &output.stderr };
        return Err(format!("FFmpeg failed:\n{tail}"));
    }

    // ── Show native Save dialog ───────────────────────────────────────────────
    let stem = stem_of(&suggested_name, "huff-recording");
    let final_path = FileDialogBuilder::new()
        .set_title("Save Video")
        .set_file_name(&format!("{stem}.{ext}"))
        .add_filter("Video file", &[ext])
        .save_file();

    let final_path = match final_path {
        Some(p) => p,
        None    => { let _ = fs::remove_dir_all(&tmp); return Ok(String::new()); }
    };

    fs::copy(&tmp_out, &final_path)
        .map_err(|e| format!("Copy to destination: {e}"))?;
    let _ = fs::remove_dir_all(&tmp);

    Ok(final_path.to_string_lossy().into_owned())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn write_zip(path: &PathBuf, frames: &[Vec<u8>]) -> Result<(), String> {
    let file = fs::File::create(path)
        .map_err(|e| format!("Create ZIP: {e}"))?;
    let mut zip = ZipWriter::new(file);
    let opts: FileOptions<'_, ()> = FileOptions::default()
        .compression_method(CompressionMethod::Stored);

    let pad = digits_needed(frames.len());
    for (i, frame) in frames.iter().enumerate() {
        let entry = format!("frame_{:0>pad$}.jpg", i + 1, pad = pad);
        zip.start_file(&entry, opts).map_err(|e| format!("ZIP entry: {e}"))?;
        zip.write_all(frame).map_err(|e| format!("ZIP write: {e}"))?;
    }
    zip.finish().map_err(|e| format!("ZIP finish: {e}"))?;
    Ok(())
}

fn stem_of(name: &str, fallback: &str) -> String {
    let t = name.trim();
    if t.is_empty() { return timestamp_name(fallback); }
    let s = t.trim_end_matches(".zip")
              .trim_end_matches(".mov")
              .trim_end_matches(".mp4")
              .trim_end_matches(".jpg")
              .trim_end_matches(".jpeg");
    if s.is_empty() { timestamp_name(fallback) } else { s.to_string() }
}

fn sanitize_folder(name: &str, fallback: &str) -> String {
    let s = name.trim()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>();
    if s.is_empty() { timestamp_name(fallback) } else { s }
}

fn timestamp_name(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{prefix}-{secs}")
}

fn digits_needed(n: usize) -> usize {
    if n == 0 { return 1; }
    (n as f64).log10().floor() as usize + 1
}
