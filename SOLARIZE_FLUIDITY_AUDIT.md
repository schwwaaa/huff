# Solarize Fluidity Audit — Pass 43

## Intent

The requested behavior is a slow, viscous Solarize response during heavy
Feedback/Persistence, similar in spirit to controllable temporal inertia in
unstable/circuit-bent video feedback systems. The implementation must not
achieve this by slowing media playback or by deliberately processing only every
N source frames.

## Signal model

```text
current active HUFF image
        ↓
existing Solarize transform
        ↓
current Solarize target (bounded scratch)
        ↓
continuous temporal slew  ← previous Solarize state
        ↓
Solarize presentation
        ↓
rest of persistent Classic behavior
```

The history belongs only to Solarize. Feedback/Persistence itself is not
retimed or modified.

## FLUIDITY semantics

- `100%`: compatibility bypass; exact Pass 42 presentation path.
- `75%`: light viscosity.
- `25–40%`: pronounced slow/liquid response intended for recursive feedback.
- `0–10%`: extremely slow evolution, but not a permanent hold.

The blend is exponential and time-normalized. At 0%, the 60 Hz reference blend
coefficient bottoms at 0.002 rather than zero; this prevents FLUIDITY from
secretly becoming a freeze control.

## Why this is not frame skipping

Pass 43 does not add:

- an every-N-frame counter;
- a Solarize strobe toggle;
- a source-frame sampler;
- playbackRate modification;
- timers that defer Solarize updates.

Each render call can continue to move the displayed Solarize memory toward its
current target. The older adaptive Solarize overload guard already present in
Classic is intentionally untouched by this pass.

## Resource boundary

The only new image resource is a low-resolution history canvas matching the
existing Solarize scratch dimensions (maximum width 640px). It is lazily
allocated only when FLUIDITY drops below 100%. The accepted one-readback /
one-upload Solarize pixel path remains unchanged.

## Runtime acceptance

Test especially with LUMA QUANTIZE + high Feedback/Persistence. FLUIDITY should
change the *rate at which the Solarize appearance evolves*, while source motion
and transport remain normal. Reject the pass if lowering FLUIDITY produces
obvious cadence stepping, playback slowdown, or changes Flow behavior.
