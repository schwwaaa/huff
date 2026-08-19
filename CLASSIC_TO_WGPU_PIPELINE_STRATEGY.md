# HUFF Classic to HUFF HD — Pipeline Switching Strategy

## Product strategy

HUFF Classic should become a stable, free, paired-down instrument with a small number of reliable routing choices. HUFF HD can use the native wgpu engine for broad modular routing, higher resolutions, larger resource budgets, and more ambitious effect systems.

The two editions should share concepts without pretending their renderers have the same limits.

## What Classic can safely support

Canvas2D can support **constrained serial recipe switching**.

A Classic recipe should be:

- selected from a small validated list;
- built from the existing stage contracts;
- serial and deterministic;
- compatible with the existing `gBuf` / `gScratch` ping-pong model;
- free of arbitrary cycles;
- free of runtime full-resolution buffer allocation;
- validated before it can render;
- saved as a preset-safe route identifier rather than a free-form graph.

Possible future recipe families include:

```text
CLASSIC
Current Pass 22 order.

FLOW EARLY
Move Flow to an earlier legal serial position, only if parity and ownership tests pass.

CRISP FINISH
Keep selected line/color stages after the primary transform.

FEEDBACK LATE
Move the existing Feedback contract to a validated later serial slot, only if its snapshot-before-clear rule remains valid.
```

These are examples for future auditing, not routes enabled by Pass 27.

## What Classic should not attempt

```text
unrestricted node graph
arbitrary parallel branches
same-frame feedback cycles
multiple unbounded full-resolution stores
dynamic shader compilation
runtime graph mutation during a frame
silent buffer allocation or quality reduction
```

Parallel branches in Canvas2D generally require another full-resolution image, duplicated rendering, or both. That is exactly where Classic stops being the stable paired-down edition.

## What wgpu can do differently

HUFF HD can represent stages as typed GPU modules with explicit inputs, outputs, resource ownership, and pass scheduling.

```text
VIDEO
MASK
KEYED VIDEO
HISTORY / STORE
CONTROL
AUDIO ANALYSIS
METADATA
```

The native engine can support:

- multiple named buses;
- explicit persistent field, trail, history, and feedback stores;
- typed parallel branches;
- program/preview and auxiliary outputs;
- effect objects with multiple surfaces;
- route validation based on GPU memory and pass budgets;
- legal cycles only through explicit temporal resources;
- higher-resolution compute and render paths;
- full modular instrument hosting.

## Recommended development order

```text
Pass 27  capability and stability instrumentation
Pass 28  output endurance and shutdown
Pass 29  platform packaging freeze
Pass 30  Classic constrained recipe switching foundation
Pass 31+ paired-down Classic effect augmentation
HUFF HD   full typed wgpu routing and expanded effects
```

Pass 30 should expose only routes proven compatible with the three-buffer Classic topology. It should not be marketed as a node graph.

## Shared vocabulary

Both editions can share:

```text
stage ID
parameter ID
preset scope
route/recipe ID
source ownership
persistent-store ownership
sequenceability
live-safety classification
```

This lets an effect or preset concept migrate from Classic to HD without requiring the two engines to use identical implementations.

## Bottom line

Classic should prove the musical usefulness of a few constrained route changes. HUFF HD should be the place where the architecture becomes fully modular.
