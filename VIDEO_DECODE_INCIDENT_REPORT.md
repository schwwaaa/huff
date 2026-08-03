# HUFF Classic Pass 12 Video Decode Incident Report

## Status

**Pass 12 direct-renderer package is rejected and must not be used as a baseline.**

The last verified working baseline is **HUFF Classic Optimization Pass 11**.

## User-visible failure

Loading a video in the Pass 12 package produced a video decode error for media that loaded correctly in the established HUFF Classic path.

## Change that introduced the regression

Pass 12 replaced the proven media path:

```text
file input → File object → URL.createObjectURL(file) → p5 createVideo(blob URL)
```

with a new path:

```text
native dialog → filesystem path → convertFileSrc(path) → Tauri asset protocol → raw <video>
```

It also moved decoding, audio, and rendering to a different WebView. That combined three independent risks in one pass:

1. a different file transport protocol;
2. a different media-element construction path;
3. a different WebView and user-gesture context for playback/audio.

## Concrete configuration defect

The rejected Pass 12 enabled the asset protocol in `tauri.conf.json`, but its checked-in `Cargo.toml` did not include Tauri's `protocol-asset` feature. Tauri v1 defines the asset protocol only when `api-all`, `protocol-all`, or `protocol-asset` is enabled.

That mismatch can leave `convertFileSrc()` producing an asset URL that the built application cannot serve, resulting in a media decode/source-not-supported failure.

## Why this package rolls back instead of applying a speculative one-line fix

Adding the feature flag would address one concrete defect, but it would not prove that large-file range requests, seeking, autoplay, audio routing, and codec behavior remain equivalent across WKWebView, WebView2, and WebKitGTK.

HUFF Classic already had a working media path. The direct-renderer migration was too broad for an optimization pass and violated the requirement to preserve working behavior.

## Resolution

This rollback package restores Pass 11 code byte-for-byte for the runtime source and native application tree. Only documentation was added or updated.

Future optimization continues from Pass 11 and keeps the established Blob URL + `createVideo()` decode path until a replacement is isolated in a separate experimental branch and proven on all target platforms.
