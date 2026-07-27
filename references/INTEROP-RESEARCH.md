# HUFF Lower-Copy Platform Interoperability Research

**Build:** `0.21.0 / HNW-21`  
**Schema:** `huff-interop-report/v1`  
**Status:** Research harness integrated; safe CPU readback remains the production path

## 1. Purpose

Milestone 21 examines whether HUFF can eventually publish its authoritative native GPU image to Syphon, Spout, or another application without sending every frame from the GPU to CPU memory and then uploading it to another GPU texture.

The milestone does **not** claim that zero-copy output is complete. It does four concrete things:

1. makes the current copy path explicit and measurable;
2. introduces a typed external-output submission boundary so future native texture transports do not need to redesign the Syphon and Spout worker APIs;
3. documents realistic Metal, Direct3D, and Vulkan candidates with requirements, blockers, and risk;
4. preserves the current bounded readback system as an automatic production-safe fallback.

This distinction is important. A speculative direct-sharing path that occasionally publishes an unfinished frame, deadlocks a queue, selects the wrong GPU adapter, or breaks after a wgpu update would be worse than the current predictable implementation.

---

## 2. Current production path

HUFF currently uses this path for Syphon and Spout:

```text
Authoritative Program texture in wgpu
        │
        │ copy_texture_to_buffer
        ▼
One of three aligned MAP_READ buffers
        │
        │ asynchronous mapping
        ▼
Dense Arc-backed RGBA CPU frame
        │
        ├──────────────→ Syphon worker → Metal texture upload → Syphon server
        │
        └──────────────→ Spout worker  → bridge image upload → Spout sender
```

When recording and a platform output request the same completed readback, they can share the same `OutputFrame` pixel allocation. Syphon and Spout do not each create another full CPU image copy.

The bounded three-slot readback ring protects the renderer. When every slot is still mapping, HUFF drops that external-output capture rather than blocking the GPU render thread.

### Current copy stages

1. **GPU-to-host transfer**  
   Program texture to a mappable wgpu buffer.

2. **Host-memory repack**  
   Padded rows from the mapped buffer to one dense RGBA allocation.

3. **Host-to-platform-texture upload**  
   Dense pixels to a Metal texture for Syphon or through the current Spout image bridge.

The INTEROP window reports the size of one frame and the estimated data rate for each full-frame stage at the selected output rate.

### Example bandwidth

A 1920×1080 RGBA8 frame contains 8,294,400 bytes, or approximately 7.91 MiB.

At 60 fps, each full-frame stage moves approximately:

```text
7.91 MiB × 60 ≈ 474.6 MiB/s
```

That estimate is **per stage**, not a promise about PCIe or unified-memory traffic. Apple Silicon may use unified physical memory, but mapping, synchronization, row repacking, and Metal texture replacement still have real cost.

At 4K, the per-stage estimate is roughly four times larger. This is why lower-copy publication becomes more valuable as output resolution and frame rate increase.

---

## 3. Typed external-output seam

Milestone 21 adds `ExternalOutputFrame` in `output_frame.rs`.

The only production variant is currently:

```text
CpuRgba(OutputFrame)
```

Syphon and Spout now accept this typed submission rather than assuming their API will always receive CPU pixels. A later feature-gated implementation can add a backend-specific submission token, for example:

```text
MetalTexture(...)
D3DSharedTexture(...)
VulkanExternalImage(...)
```

Such variants are intentionally **not** present yet. Their ownership, Send/Sync behavior, fence lifetime, format, and device identity must be defined before they can safely cross worker-thread boundaries.

The seam is therefore architectural preparation, not a disguised zero-copy claim.

---

## 4. macOS candidates

### 4.1 Direct Metal texture publication to Syphon

Ideal path:

```text
wgpu Program Metal texture
        │
        └────────→ SyphonMetalServer publish
```

Potential benefit:

- no CPU frame readback;
- no CPU row repack;
- no CPU-to-Metal upload;
- lower latency and memory bandwidth.

Required proof:

- obtain the native Metal texture behind the wgpu texture through a feature-gated backend API;
- verify that wgpu and Syphon use the same Metal device;
- publish only after the render command buffer has completed the Program texture write;
- define RGBA/BGRA format, orientation, alpha, and color-space behavior;
- prove that the texture remains alive until Syphon has completed publication;
- automatically fall back when any condition is not satisfied.

Primary risk:

wgpu deliberately abstracts backend handles. Accessing a raw Metal resource is unsafe, backend-specific, and coupled to the exact wgpu/wgpu-hal version.

### 4.2 IOSurface-backed bridge texture

Safer boundary candidate:

```text
wgpu Program texture
        │ GPU texture copy
        ▼
IOSurface-backed Metal output texture
        │
        └────────→ SyphonMetalServer
```

This likely retains one GPU-to-GPU copy, but removes the GPU-to-CPU and CPU-to-GPU round trip. It also gives the output bridge explicit ownership of its publication texture.

This may be preferable when direct aliasing of the renderer’s Program texture is fragile or unsupported.

---

## 5. Windows candidates

### 5.1 Direct3D 12 shared-handle path

Ideal path:

```text
wgpu D3D12 Program texture
        │ shared handle + fence
        ▼
Extended Spout bridge
        │
        └────────→ receiver
```

Required proof:

- extend the C++ bridge to accept a shared GPU texture or handle instead of an RGBA pointer;
- ensure wgpu and the bridge use the same physical adapter;
- coordinate fences and resource-state transitions;
- define DXGI format and lifetime ownership;
- verify receiver compatibility on actual Spout clients;
- reject cross-adapter or stale-handle cases cleanly.

The adapter check is essential. A handle created on one GPU is not automatically valid on another GPU in a multi-adapter system.

### 5.2 D3D11On12 compatibility bridge

Possible compatibility path:

```text
wgpu D3D12 texture
        │ wrap or GPU copy
        ▼
D3D11-visible resource
        │
        └────────→ Spout-compatible sender
```

This could preserve a GPU-only path when receiver compatibility is D3D11-oriented. It adds complexity around wrapped-resource acquire/release operations, queue synchronization, and resource-state transitions.

It should remain isolated inside the Spout bridge rather than leaking Direct3D ownership into the HUFF render graph.

---

## 6. Vulkan and Linux-compatible environments

Vulkan external-memory and external-semaphore APIs can theoretically expose an image to another process without CPU readback.

The difficulty is not only Vulkan. There must also be a concrete receiver protocol that agrees on:

- exported memory-handle type;
- semaphore/fence handle type;
- image format;
- tiling and modifier;
- dimensions and color space;
- ownership and release behavior.

There is no single universal Syphon/Spout-equivalent contract across Linux creative applications. HUFF should therefore not implement a generic Vulkan-sharing layer until a real receiver and protocol are selected.

---

## 7. INTEROP window

The top bar now includes **INTEROP**.

### Analyze Current Path

Produces a live `huff-interop-report/v1` report using the current:

- operating system;
- wgpu backend;
- GPU adapter and driver;
- render dimensions;
- active Syphon or Spout rate;
- current external-output state;
- readback errors and copy topology.

The report clearly labels every native-sharing path as a candidate, secondary candidate, research-only path, or not applicable.

### CPU Copy Probe

Runs a bounded host-memory `copy_from_slice` benchmark and estimates how long one full current-resolution RGBA frame would take at the observed memcpy rate.

The probe does **not** measure:

- GPU texture-to-buffer copy;
- buffer-map latency;
- GPU/CPU synchronization;
- Metal or Direct3D upload;
- receiver latency;
- end-to-end presentation latency.

It is only a baseline showing whether plain host-memory copying is itself a significant part of the cost.

### Export Report

Writes:

```text
huff-interop-report.json
huff-interop-report.txt
```

The normal Milestone 20 diagnostics folder now also includes:

```text
interop-report.json
interop-report.txt
```

---

## 8. Acceptance criteria for a future native-sharing proof of concept

A direct or lower-copy implementation should not replace the current fallback until it passes all of the following.

### Correctness

- frame identity matches the bounded readback path;
- no partial or stale frames;
- orientation and channel order match;
- alpha behavior is defined;
- resolution changes rebuild safely.

### Synchronization

- no publication before GPU completion;
- no use-after-free texture handles;
- no render-thread stalls waiting for receivers;
- no deadlocks during output restart or application shutdown.

### Adapter safety

- backend and physical adapter are identified;
- cross-adapter sharing is rejected or explicitly bridged;
- multi-GPU behavior is tested.

### Recovery

- receiver disconnect does not crash HUFF;
- output restart releases all native handles;
- device or surface recovery invalidates stale handles;
- automatic fallback activates without changing Program state.

### Performance

- lower end-to-end latency than bounded readback;
- materially lower CPU utilization or memory traffic;
- no meaningful render-frame regression;
- no increasing queue depth over long sessions.

### Compatibility

- tested against more than one receiver where applicable;
- debug and production builds behave consistently;
- exact wgpu version dependency is documented;
- backend-specific code remains feature-gated and isolated.

---

## 9. Recommended development order

### Phase A — measurement and contract

Completed in Milestone 21:

- report current copies;
- establish typed output submission;
- collect adapter/backend data;
- define candidate and fallback requirements.

### Phase B — one-platform proof of concept

Choose one concrete target:

```text
macOS + Metal + Syphon
```

or:

```text
Windows + D3D12 + a named Spout receiver
```

Build it behind a compile-time feature and runtime opt-in. Never remove the readback path.

### Phase C — A/B verification

Publish the same Program frame through both transports and compare:

- frame checksum or captured pixels;
- output latency;
- render frame time;
- CPU usage;
- readback drops;
- receiver stability.

### Phase D — guarded production option

Only after the proof passes should the application expose:

```text
External output transport:
- Safe Readback
- Native Shared Texture (Experimental)
- Automatic
```

`Automatic` must fall back to Safe Readback on any mismatch or failure.

---

## 10. Final status

Milestone 21 completes the planned roadmap without pretending that an unsafe backend-specific texture path is production-ready.

The practical result is:

> HUFF now knows and reports how frames leave the GPU, can estimate the cost of that path, has a transport boundary prepared for future native resources, and contains a documented test contract for replacing copies safely.

The current bounded readback bridge remains the correct default for the comprehensive refinement and cross-platform test cycle.
