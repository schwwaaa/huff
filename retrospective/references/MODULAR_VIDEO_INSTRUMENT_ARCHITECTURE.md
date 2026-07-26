# Modular Video Instrument Architecture

**Working title:** A family of standalone native video instruments built from HUFF and the wgpu Junkpile experiments  
**Status:** Architecture and product-direction memo  
**Purpose:** Define how the strongest ideas from the Fairlight CVI / Video Entertainer, Snell & Wilcox Magic DaVE, Grass Valley INDIGO, HUFF, and the Junkpile wgpu examples can become a modular family of contemporary video instruments rather than one monolithic application.

---

## 1. Executive thesis

The strongest direction is not to turn HUFF into a single enormous application containing every historical idea, every effect, every routing possibility, every sequencer, every mixer, and every output mode.

The stronger direction is:

> Build a family of opinionated standalone video instruments on top of one shared native engine, then build a master suite that can load, route, synchronize, automate, and record those instruments.

The individual instruments should remain useful and complete by themselves.

The master suite should act as:

- a rack;
- a patchbay;
- a source manager;
- a program/preview environment;
- an automation coordinator;
- an output and recording system.

It should not become the only place where the instruments can run.

This keeps the architecture modular while preserving the unusual creative asymmetry that made older video tools compelling.

---

## 2. Why asymmetry is valuable

A highly symmetrical creative application tries to make every source, effect, route, layer, and parameter behave according to one universal model.

That often produces:

- generic node graphs;
- giant timelines;
- plugin racks with no coherent identity;
- interfaces where every function has equal visual weight;
- feature discovery through menus rather than through an understandable instrument model.

The historical systems studied here did not work that way.

Each machine had an opinionated topology.

### Fairlight CVI

The Fairlight treated:

- live video;
- frozen video;
- painted imagery;
- internal stencils;
- live keys;
- color;
- spatial movement;
- temporal capture;

as parts of one image instrument.

Its identity came from the relationship among those parts, not merely from a list of effects.

### Magic DaVE

Magic DaVE treated an effect as a programmable structure:

- front and back image surfaces;
- geometry;
- transformation;
- lighting;
- trails;
- keys;
- transitions;
- stored shots and sequences.

Its identity came from constructing and animating image objects.

### Grass Valley INDIGO

INDIGO treated video production as a set of explicit operational relationships:

- program and preview;
- current and next source;
- buses;
- keyers;
- auxiliaries;
- transition selection;
- scoped state recall;
- audio-follow-video.

Its identity came from making complex live operation legible and safe.

### The design lesson

The limitations and topology of each instrument guide the artist toward specific techniques.

A Field Store instrument should not feel like a switcher with half its controls hidden.

A DVE instrument should not feel like a generic shader rack.

A Program/Preset Mixer should not feel like a node graph.

Each should feel complete because its limitations and strengths form a coherent creative environment.

---

## 3. The product model

The proposed system has three levels.

```text
LEVEL 1
Shared native instrument engine

LEVEL 2
Standalone focused instruments

LEVEL 3
Master suite / rack / router
```

---

# Part I — Shared Native Instrument Engine

## 4. Shared engine responsibilities

The shared engine should contain the difficult technical systems that should not be reimplemented for every application.

```text
Media acquisition
- camera capture
- video file decoding
- still images
- generators
- synchronized audio where applicable

GPU infrastructure
- wgpu device and surface management
- texture allocation
- render and compute scheduling
- shader modules
- resource pooling
- format negotiation

Image memory
- history rings
- field stores
- feedback buffers
- trail stores
- still stores
- masks and key textures

Control
- parameter schemas
- actions and triggers
- MIDI
- OSC
- keyboard and pointer input
- gesture mappings
- macro controls

State
- presets
- scoped recall
- snapshots
- sequences
- projects
- migration and versioning

Output
- program windows
- preview windows
- auxiliary outputs
- Syphon
- Spout
- recording
- frame export
- still capture

Reliability
- decoder supervision
- source health
- GPU-resource health
- recovery paths
- diagnostics
- state validation
```

The instruments should share these systems while remaining independent applications.

---

## 5. Shared engine versus shared interface

A shared engine does not imply a shared interface.

The engine may support:

- two-dimensional and three-dimensional transforms;
- multiple persistent buffers;
- masking;
- keying;
- transitions;
- sequencing;
- multiview;
- projection mapping;
- recording;
- MIDI and OSC.

A particular instrument might expose only six of these capabilities.

The Field Store application might use:

```text
camera / file input
one persistent image store
one stencil store
one live key
two-region compositing
color controls
MIDI / OSC
recording
```

It would not necessarily load or expose:

```text
3D geometry
eight-source routing
projection mapping
full multiview
multiple downstream keyers
a generalized automation editor
```

The distinction is:

> Engine capability is broad. Instrument identity is narrow and deliberate.

---

## 6. Shared canonical state

Every instrument should use a canonical state model owned by the native engine.

The interface should not send arbitrary values directly into shaders.

A parameter should have:

```text
stable identifier
display name
data type
default value
range
unit
interpolation policy
preset scope
sequenceability
automation behavior
live-safety classification
target module
```

An action should have:

```text
stable identifier
trigger semantics
target module
whether it is repeatable
whether it is recordable
whether it is reversible
whether it is safe on program output
```

Examples of actions:

```text
capture frame
clear field store
invert stencil
take preview to program
recall preset
begin trail accumulation
stop trail accumulation
reset DVE object
arm recording
```

This makes the engine, interface, preset system, automation system, and external control protocols speak the same language.

---

## 7. Shared typed resources

The engine should distinguish different resource classes.

### Current video frame

The most recent decoded or captured image.

### Processed live frame

A current image after selected nonpersistent processing.

### History ring

A bounded collection of recent frames for temporal sampling.

### Field store

A persistent image that can be held, selectively overwritten, transformed, or protected.

### Feedback store

A persistent image updated from a prior composite or prior processed state.

### Trail store

A persistent temporal image with explicit decay, delay, montage, key, and spatial policies.

### Still store

An explicitly captured image with metadata.

### Stencil store

A persistent region-control texture.

### Live key

A mask derived continuously from incoming video.

### Program composite

The committed output.

### Preview composite

A prepared output not yet committed.

These resources should not be collapsed into one generic texture type at the architectural level, even if they use related GPU formats internally.

---

# Part II — Instrument Family

## 8. Instrument 1: Field Store

The Field Store should be the first new instrument.

It is the clearest synthesis of:

- HUFF’s existing temporal and feedback systems;
- the Fairlight CVI field-store model;
- stencil-based image ownership;
- native wgpu persistence and compute processing.

### Core identity

> A playable image-memory instrument where live video, stored imagery, masks, and temporal update policies interact.

### Proposed topology

```text
Live Input A ──────┐
                   │
Live Input B ──────┤
                   ▼
            Source conditioning
                   │
                   ▼
          Persistent field store
                   │
       ┌───────────┼───────────┐
       │           │           │
   update       transform    process
   policy       stored image stored image
       │           │           │
       └───────────┴───────────┘
                   │
Stencil / Key ─────┤
                   ▼
          Two-region compositor
                   │
                   ▼
                 Output
```

### Inputs

A first version could have:

```text
Live A
Live B
Still
Internal color or pattern
```

### Persistent resources

```text
Field Store 1
Internal Stencil 1
Optional Live Key
```

### Update policies

The central design principle is:

> The field store is the memory. The update mode is a policy controlling that memory.

Possible policies:

```text
LIVE
The store is bypassed or continuously replaced.

HOLD
The current stored image remains unchanged.

CAPTURE
A trigger replaces the store once.

SAMPLE
The store is replaced periodically.

STROBE
Discrete captures occur at a selected temporal rate.

ACCUMULATE
New imagery is blended into the existing store.

TRAIL
New imagery enters while old imagery decays.

SCAN
Only a moving region is updated.

CATCH-UP
The stored image progressively returns to current live state.

PROTECTED UPDATE
Only pixels enabled by a write mask may change.

SLIDE AND STORE
The stored image is transformed before a new region is written.

FEEDBACK
A prior processed or composited image updates the store.
```

### Mask roles

The Field Store should make mask roles explicit.

```text
DISPLAY MASK
Determines which image appears in each region.

PROCESS MASK
Determines where an effect is applied.

WRITE MASK
Determines which pixels in the field store may update.

PROTECT MASK
Determines which pixels must remain unchanged.

RESTORE MASK
Determines where clean live imagery is reintroduced.

ROUTING MASK
Determines which pixels are sent into an alternate processing path.
```

A single stencil may serve several roles, but those roles should be visible and individually assignable.

### Creative controls

The performance surface could group controls by meaning.

```text
SOURCE
A, B, still, store, color, pattern

MEMORY
hold, capture, sample, trail, scan, clear

TIME
rate, decay, age, interval, catch-up speed

REGION
stencil source, invert, feather, write, protect

MOVEMENT
pan, zoom, stretch, rotate, wrap

COLOR
hue, saturation, value, depth, remap

COMPOSITE
region A source, region B source, under/over, mix
```

### Hard limits

A first version should remain deliberately small:

```text
2 live sources
1 field store
1 internal stencil
1 live key
1 two-region compositor
1 program output
```

Those limits make the application understandable and give it an identity.

---

## 9. Instrument 2: Trail Store

The Trail Store should specialize in persistent temporal accumulation.

### Core identity

> A dedicated temporal-residue processor where motion, delay, decay, masks, and recursive image treatment become the primary materials.

### Proposed topology

```text
Input ───────────→ Input transform ──────────┐
                                              │
Mask / Key ─────→ Write gate                 ▼
                                        Trail Store
                                              │
                         ┌────────────────────┼────────────────────┐
                         ▼                    ▼                    ▼
                       time                 space                 color
                   delay / decay      drift / wrap / blur   remap / separate
                   strobe / hold      scale / rotation       posterize / key
                         └────────────────────┬────────────────────┘
                                              ▼
                                            Output
```

### Temporal modes

```text
continuous trails
discrete strobe trails
freeze trails
montage
multi-tap history
color-separated history
recursive shadow
masked trails
keyed trails
moving trails
wrapped trails
decay by luminance
decay by color
decay by motion
```

### Store properties

The Trail Store should expose its persistence explicitly.

```text
input source
write source
write mask
read delay
history taps
decay profile
clear behavior
spatial transform
color transform
output mix
store health
```

### Hard limits

```text
1 image input
1 mask or key input
1 persistent trail store
up to 4 history taps
1 output
```

This should not become a general mixer.

---

## 10. Instrument 3: Stencil Painter

The Stencil Painter should focus on active region construction.

### Core identity

> A live image-compositing and mask-painting instrument where drawing controls visibility, routing, processing, and memory updates.

### Proposed topology

```text
Source A ───────────────┐
                        │
Source B ───────────────┤
                        ▼
                 Region compositor
                        ▲
                        │
           Internal stencil plane
                        ▲
       ┌────────────────┼────────────────┐
       │                │                │
    drawing           wipes          generated key
```

### Stencil sources

```text
freehand drawing
texture brushes
geometric shapes
wipes
patterns
luminance key
chroma key
motion mask
depth mask
external mask
still image alpha
```

### Drawing targets

The user should choose exactly what drawing changes.

```text
paint image
paint stencil
erase stencil
protect store
enable store writes
restore clean source
route to alternate process
```

### Performance interactions

```text
pressure-sensitive brush
touch or stylus position
brush size
brush softness
texture
symmetry
invert
momentary draw
draw lock
wipe trigger
clear
swap on/off regions
```

### Hard limits

```text
2 image sources
1 internal stencil
1 optional live key
1 two-region compositor
1 paint/store target
```

The application should remain a live instrument, not a general raster editor.

---

## 11. Instrument 4: DVE Object

The DVE Object instrument should reinterpret Magic DaVE’s structured effects using modern GPU geometry.

### Core identity

> A programmable image-object instrument with typed surfaces, geometric models, lighting, keying, and transitions.

### Proposed topology

```text
Source A ───────→ Front surface ──────────┐
                                           │
Source B ───────→ Back surface ───────────┤
                                           ▼
                                  Geometric model
                                           │
                                 transform / perspective
                                           │
                               crop / border / lighting
                                           │
Mask / Key ────────────────────────────────┤
                                           ▼
                                        Output
```

### Typed image surfaces

A DVE object may expose:

```text
front
back
edge
border
mask
shadow
background
```

Not every model needs every surface.

### Initial model families

```text
flat card
page turn
slab
twin tiles
quad split
corner pin
cylindrical wrap
sphere
ripple plane
multi-tile field
front/back flip
```

### Geometric controls

```text
position X/Y/Z
rotation X/Y/Z
scale
perspective
pivot
crop
surface curvature
page curl
tile count
tile spacing
```

### Appearance controls

```text
border width
border color
light direction
highlight
shadow
surface color processing
front/back source assignment
opacity
key output
```

### Sequence compatibility

Every transform parameter should declare:

```text
sequenceable?
interpolatable?
allowed interpolation modes
safe to interrupt?
reversible?
```

### Hard limits

A first DVE instrument could support:

```text
2 image inputs
1 object
front and back surfaces
1 border
1 shadow
1 key or alpha output
```

It should not begin as a complete 3D scene editor.

---

## 12. Instrument 5: Program/Preset Mixer

The Program/Preset Mixer should extract the strongest operational concepts from INDIGO.

### Core identity

> A focused live video mixer with explicit program, preview, key, transition, auxiliary, and scoped-memory behavior.

### Proposed topology

```text
Sources 1..N
    │
    ├────────────→ Preview Bus ───────────┐
    │                                      │
    └────────────→ Program Bus ────────────┤
                                           ▼
                                  Transition Engine
                                           │
                                           ▼
                                  Background Composite
                                           │
                   ┌───────────────────────┼───────────────────────┐
                   ▼                       ▼                       ▼
                 Key 1                   Key 2                 Graphics
                   └───────────────────────┬───────────────────────┘
                                           ▼
                                        Program
                                           │
                           ┌───────────────┼───────────────┐
                           ▼               ▼               ▼
                         Aux 1          Recorder       Syphon/Spout
```

### Initial scope

```text
4 or 8 sources
program bus
preview bus
2 keyers
1 graphics/still layer
2 auxiliary buses
1 transition engine
multiview
recording
```

### Transition controls

```text
CUT
AUTO
manual transition
reverse
pause
selected transition participants
duration
profile
```

### Next-transition selection

The operator should decide what changes during the next transition.

```text
background
key 1
key 2
graphics
selected linked group
```

### Direct mode and staged mode

The mixer should support two operation styles.

#### Direct mode

Changes affect program immediately.

Use cases:

- experimental performance;
- improvised source switching;
- rapid visual play.

#### Preview/Take mode

Changes are made to preview and committed through CUT, AUTO, or a transition control.

Use cases:

- deliberate production;
- multi-layer preparation;
- safe live output.

### Scoped state memories

A memory should be able to include selected domains.

```text
[x] source assignment
[x] keyer state
[x] transition state
[x] routing
[ ] recording state
[ ] output resolution
[ ] device configuration
[x] effect parameters
```

### Hard limits

The first mixer should remain smaller than a full broadcast switcher.

The goal is a creative production instrument, not an administrative production platform.

---

## 13. Instrument 6: Sequence Machine

The Sequence Machine should control state movement across one or more instruments.

### Core identity

> A source-independent performance recorder and state sequencer for instrument parameters, actions, presets, routes, and transitions.

### Proposed topology

```text
Instrument state
      │
      ▼
Parameter and action registry
      │
      ├── continuous controls
      ├── discrete actions
      ├── preset recalls
      ├── routing changes
      └── capture / clear events
      │
      ▼
Shots / keyframes / gestures
      │
      ▼
Timing / interpolation / triggering
      │
      ▼
One or more instruments
```

### State object distinctions

```text
PRESET
A reusable artistic condition.

SHOT
A state used as an endpoint in a sequence.

SEQUENCE
A timed collection of shots and actions.

SNAPSHOT
A complete instrument state.

PROJECT
Presets, sequences, mappings, stores, routes, and configuration.
```

### Event types

```text
parameter change
trigger
preset recall
routing assignment
capture
clear
take
transport command
record arm
output change
```

### Interpolation modes

```text
step
linear
smooth
curved
ease in
ease out
custom tension
custom acceleration
```

### Sequenceability schema

Not every property should be sequenceable.

Examples of likely non-sequenceable or restricted settings:

```text
GPU adapter
output format
camera device
resource-allocation limit
project location
recording codec
```

### Hard limits

A first version should sequence known registered modules rather than attempting a universal scripting language.

---

## 14. Instrument 7: Output Mapper

The Output Mapper should remain downstream and independent.

### Core identity

> A focused output-surface instrument for framing, mesh warping, calibration, projection, and final display.

### Proposed topology

```text
Program or instrument input
            │
            ▼
       crop / framing
            │
            ▼
         mesh warp
            │
            ▼
feather / black level / gamma
            │
            ▼
 projector / display / capture
```

### Capabilities

```text
corner pin
mesh warp
edge feather
black-level compensation
gamma
output crop
orientation
safe areas
calibration grid
multiple saved mappings
dedicated output window
```

### Hard limits

The first mapper should target one output surface.

Multiple surfaces can be added only after calibration and project recall are proven reliable.

---

# Part III — Master Suite

## 15. The master suite’s role

The master suite should not absorb all instrument interfaces into one giant panel.

Its job is orchestration.

```text
source management
instrument loading
instrument-to-instrument routing
sends and returns
program / preview
global automation
cross-instrument presets
output assignment
recording
diagnostics
```

A useful analogy is:

```text
Individual instrument = synthesizer, effects box, sampler, mixer, or sequencer
Master suite = rack, patchbay, transport, monitor section, and recorder
```

---

## 16. Master suite signal model

```text
                         SOURCE RACK
               camera / file / still / generator
                              │
            ┌─────────────────┼──────────────────┐
            ▼                 ▼                  ▼
      Field Store        DVE Object         Stencil Painter
            │                 │                  │
            └─────────────────┼──────────────────┘
                              ▼
                         Trail Store
                              │
                              ▼
                    Program/Preset Mixer
                              │
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
               Preview      Program      Aux
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
                 Recorder  Syphon     Mapper
```

The user should be able to load only the needed instruments.

---

## 17. Instrument communication

At first, instruments should communicate through explicit typed ports and shared in-process resources.

Possible port types:

```text
VIDEO
A full image texture or frame stream.

MASK
A single-channel region texture.

KEYED VIDEO
Video with meaningful alpha or key semantics.

CONTROL
Parameter values, triggers, transport, or state commands.

AUDIO
A synchronized audio stream.

AUDIO ANALYSIS
Levels, bands, FFT data, onset, or waveform features.

METADATA
Timing, color space, frame dimensions, source health.
```

Typed ports prevent invalid routes and make the graph understandable.

---

## 18. Graph recipes

Each instrument should be defined internally through a validated recipe.

Example:

```yaml
instrument:
  id: field-store
  version: 1

  inputs:
    - id: live_a
      type: video
    - id: live_b
      type: video
    - id: live_key
      type: mask
      optional: true

  resources:
    - id: field_store_0
      type: persistent_video
    - id: stencil_0
      type: persistent_mask

  stages:
    - source_condition
    - field_store_update
    - region_composite
    - output_process

  outputs:
    - id: program
      type: video
    - id: stencil_out
      type: mask
```

The recipe defines:

```text
legal modules
typed inputs
typed outputs
persistent resources
allowed cycles
parameter schemas
preset scope
sequenceability
resource limits
default interface
```

The user initially sees the instrument, not the recipe.

The suite may eventually expose an advanced structural editor, but unlimited patching should not be the default interaction.

---

## 19. Explicit cycles only

Feedback is essential to video art, but arbitrary graph cycles create ambiguity and GPU hazards.

A useful rule is:

> A graph cycle is legal only if it passes through an explicit temporal resource.

Legal cycle modules could include:

```text
Field Store
Trail Store
Feedback Store
Frame Delay
History Tap
```

This makes recursion visible and gives it:

```text
defined allocation
defined frame delay
defined resolution
defined clear behavior
defined write policy
defined health state
```

It also prevents accidental same-frame read/write hazards.

---

## 20. Resource budgets

Every instrument recipe should declare limits.

```text
maximum input count
maximum persistent texture count
working resolution
texture format
estimated memory use
number of render passes
number of compute passes
latency class
supported frame rates
```

The master suite should calculate the combined cost of loaded instruments.

Possible health states:

```text
READY
DEGRADED
OVER BUDGET
RECOVERING
SOURCE LOST
OUTPUT LOST
```

The suite should never silently reduce quality or fail invisibly.

---

# Part IV — Avoiding a Monolith

## 21. Architectural boundaries

The system should be divided into shared crates with clear responsibilities.

```text
video-instruments/
│
├── crates/
│   ├── instrument-core/
│   │   IDs, clocks, events, state vocabulary
│   │
│   ├── instrument-media/
│   │   camera, decoding, stills, audio, transport
│   │
│   ├── instrument-gpu/
│   │   device, textures, pipelines, scheduling, resource pools
│   │
│   ├── instrument-store/
│   │   field stores, history rings, trails, feedback
│   │
│   ├── instrument-mask/
│   │   stencil, matte, chroma, luma, motion masks
│   │
│   ├── instrument-dve/
│   │   geometry, surfaces, lighting, borders
│   │
│   ├── instrument-composite/
│   │   layers, blend, keys, transitions
│   │
│   ├── instrument-routing/
│   │   typed ports, graph validation, buses
│   │
│   ├── instrument-state/
│   │   presets, snapshots, sequences, projects
│   │
│   ├── instrument-control/
│   │   MIDI, OSC, gestures, mappings, macros
│   │
│   └── instrument-output/
│       windows, recording, export, Syphon, Spout
│
├── apps/
│   ├── field-store/
│   ├── trail-store/
│   ├── stencil-painter/
│   ├── dve-object/
│   ├── program-mixer/
│   ├── sequence-machine/
│   ├── output-mapper/
│   └── master-suite/
│
└── modules/
    ├── huff-glitch/
    ├── huff-scan/
    ├── huff-flow/
    ├── solarize/
    ├── keyer/
    ├── temporal-store/
    └── transition-library/
```

---

## 22. Static modules before binary plugins

A third-party dynamic plugin system should not be the first objective.

A Rust binary plugin ABI across:

- macOS;
- Windows;
- Metal;
- Direct3D 12;
- Vulkan;
- changing wgpu versions;
- changing Rust compiler versions;

would create a large compatibility burden.

The first model should use:

```text
shared Rust crates
statically linked modules
a module registry
serialized manifests
stable state schemas
stable parameter identifiers
```

The master suite can compile known modules into one executable.

A formal external plugin system can be considered only after the internal boundaries have been validated through several complete instruments.

---

## 23. Interface independence

Each instrument should have an interface designed around its own creative model.

### Field Store interface

Large memory and stencil controls.

### Trail Store interface

Temporal controls, store visualization, and history taps.

### DVE Object interface

Joystick-like transform controls, model selection, surfaces, and keyframes.

### Program Mixer interface

Crossbars, program/preview, key delegation, and transitions.

### Sequence Machine interface

Shots, gesture recording, timing, interpolation, and trigger relationships.

Shared visual components are useful, but identical layouts would weaken the instruments.

---

## 24. Shared file formats

The instruments should share a common container or family of schemas.

Possible files:

```text
.instrument-preset
.instrument-snapshot
.instrument-sequence
.instrument-project
.instrument-store
.instrument-still
.instrument-mapping
```

Each file should include:

```text
schema version
instrument ID
module versions
parameter IDs
resource references
migration metadata
human-readable summary
```

The goal is long-term project survival and reliable migration.

---

# Part V — Relationship to HUFF

## 25. Why HUFF’s fixed pipeline was correct

The fixed pipeline is valuable during the native port because it provides:

- deterministic order;
- parity with the earlier implementation;
- easier bug isolation;
- easier performance measurement;
- clear GPU ownership;
- a stable reference result.

The fixed pipeline should not be removed merely because a graph is theoretically more flexible.

It should remain a valid instrument recipe.

---

## 26. Where the fixed pipeline becomes limiting

The current HUFF architecture reveals routing questions that cannot be solved cleanly through parameter adjustment alone.

When several effect families share one intermediate buffer, draw order becomes topology.

Questions emerge:

```text
Does flow process glitch?
Does flow process scanlines?
Does luma key see clean input or a processed composite?
Does feedback receive the final image or an intermediate image?
Which layer remains crisp?
Where is clean video restored?
Which effect owns the persistent buffer?
```

These are routing and resource-ownership questions.

A modular engine could express:

```text
Glitch output ────────┐
                      ├── composite
Scanline output ──────┘
```

Flow could then target:

```text
glitch only
scanlines only
their composite
the feedback store
the final program image
```

The important constraint is that this should be expressed through a small number of named buses and insertion points, not an unrestricted graph with hundreds of connections.

---

## 27. HUFF modules that could be extracted

HUFF can eventually be divided into reusable modules.

### Source module

```text
camera
video file
transport
source health
```

### Glitch module

```text
corruption
tile displacement
channel effects
data-like treatments
```

### Scan module

```text
scanlines
line structures
spatial and temporal modulation
```

### Flow module

```text
motion field
warp
advection
```

### History module

```text
history ring
delay taps
age selection
```

### Feedback module

```text
persistent recursive image
transform
decay
clear
```

### Composite module

```text
clean source
processed layers
keying
blend
restore
```

### Control module

```text
canonical parameters
MIDI / OSC
macros
automation
```

The original HUFF application can remain one specific arrangement of those modules.

---

# Part VI — The 2000s Application Quality

## 28. What should be preserved

Individual creative applications from the late 1990s and 2000s often had:

- a strong internal model;
- custom terminology;
- unusual interfaces;
- independent project formats;
- specific limitations;
- distinctive workflows;
- memorable quirks;
- a feeling that each application was a separate object.

Those qualities are useful when they reinforce creative identity.

```text
KEEP
strong identity
specialized topology
instrument-specific vocabulary
custom interactions
opinionated limitations
standalone ownership
unexpected results
learnable behavior
```

---

## 29. What should be removed

The bad historical limitations should not be recreated.

```text
REMOVE
fragile codecs
fixed low resolution
opaque hidden state
destructive saving
silent failure
unrecoverable crashes
hardware lock-in
poor file migration
menus appearing on program output
ambiguous resource ownership
```

The new system should feel specialized without feeling obsolete.

---

## 30. Why standalone ownership matters

A standalone instrument should:

- launch quickly;
- load a source;
- produce an image immediately;
- save its own presets and projects;
- record or output independently;
- expose MIDI and OSC;
- work without the master suite.

This has artistic and practical value.

The artist can choose:

```text
one focused instrument
several separate applications connected through Syphon/Spout
the master suite hosting several instruments
a hybrid hardware/software setup
```

The system should not force a single workflow.

---

# Part VII — Development Order

## 31. Recommended implementation sequence

### Phase 1: Extract shared substrate

From HUFF and the Junkpile examples, stabilize:

```text
GPU context
media sources
texture and resource management
parameter registry
event system
persistent stores
mask textures
output windows
recording
diagnostics
```

### Phase 2: Build Field Store

This becomes the architectural test case.

It proves:

```text
typed inputs
persistent resources
mask roles
temporal policies
standalone application packaging
presets
MIDI / OSC
recording
```

### Phase 3: Build Trail Store

This proves:

```text
recursive routing
explicit legal cycles
temporal store health
multi-tap history
decay and spatial processing
```

### Phase 4: Build DVE Object

This proves:

```text
typed multi-surface effects
geometry
lighting
key output
keyframe compatibility
```

### Phase 5: Build Program/Preset Mixer

This proves:

```text
named buses
program / preview
keyers
transition state
scoped memories
multiview
aux outputs
```

### Phase 6: Build Sequence Machine

This proves:

```text
cross-instrument parameter control
shot state
automation
gesture recording
interpolation
trigger behavior
```

### Phase 7: Build Master Suite

Only after the individual instruments reveal the correct module boundaries.

---

## 32. Why Field Store should come first

Field Store is the best first instrument because it combines the most important ideas while remaining achievable.

It uses:

- HUFF-style live video processing;
- GPU persistence;
- history and feedback knowledge;
- mask textures;
- Fairlight stencil logic;
- presets;
- MIDI and OSC;
- standalone output.

It does not initially require:

- a complete switcher;
- multiple 3D objects;
- a universal timeline;
- third-party plugins;
- complex network distribution.

It provides a strong test of whether the modular architecture actually produces a compelling instrument.

---

# Part VIII — Field Store Instrument Contract

## 33. Preliminary contract

### Inputs

```text
Video A
Video B
Still
Live key
External mask
Control events
```

### Persistent resources

```text
Field Store
Stencil Store
Optional History Ring
```

### Outputs

```text
Program video
Preview video
Stencil output
Store output
Diagnostics
```

### Legal routes

```text
Video A → live path
Video B → live path
Still → region source
Field Store → region source
Live path → field-store write
Program → field-store write through explicit feedback mode
Stencil → display mask
Stencil → write mask
Stencil → protect mask
Live key → display or write mask
```

### Illegal routes

```text
same-frame field-store read/write without a temporal boundary
program feedback without explicit feedback mode
mask connected to a full-video-only input
configuration commands recorded as ordinary performance automation
```

### Update-policy state

```text
mode
capture trigger
sample interval
decay
blend amount
scan position
scan width
catch-up rate
write source
write mask
clear mode
```

### Region-compositor state

```text
region A source
region B source
mask source
invert
feather
under/over mode
mix amount
```

### Store-transform state

```text
pan X/Y
zoom
stretch
rotation
wrap
filtering
```

### Recall scope

A Field Store preset may include:

```text
[x] update policy
[x] region sources
[x] mask assignment
[x] color controls
[x] movement controls
[x] effect parameters
[ ] current store pixels by default
[ ] source device by default
[ ] output configuration
```

A snapshot may optionally include store pixel contents.

---

# Part IX — Design Rules

## 34. Core rules

1. **Each instrument must have one clear sentence describing what it is.**

2. **Each instrument must have a bounded topology.**

3. **Every persistent image resource must be visible and nameable.**

4. **Every feedback cycle must pass through an explicit temporal module.**

5. **Masks must have explicit roles.**

6. **Presets must have recall scope.**

7. **Configuration must remain separate from performance state.**

8. **Automation must target canonical state, not interface gestures.**

9. **Every instrument must work independently of the master suite.**

10. **The master suite must coordinate rather than absorb instrument identity.**

11. **No hidden quality reduction or silent failure.**

12. **The original HUFF fixed pipeline must remain a valid recipe.**

---

## 35. Non-goals for the first generation

The first generation should not attempt:

```text
a fully unrestricted node graph
a universal nonlinear editor
a complete broadcast production platform
a generic 3D content-creation suite
a binary third-party plugin ABI
cloud collaboration
subscription-dependent project storage
AI-generated routing as a core requirement
every historical effect from every reference machine
```

The priority is to establish a powerful and coherent family of video instruments.

---

# Part X — Evaluation Criteria

## 36. Instrument quality tests

An instrument is successful when:

### Identity

A user can explain its purpose in one sentence.

### Immediacy

A source can be loaded and a meaningful result produced quickly.

### Depth

The instrument supports advanced techniques without becoming a general-purpose editor.

### Legibility

The user can see:

```text
what source is active
what memory exists
what is being updated
what mask is controlling
what route is active
what output is live
```

### Repeatability

Presets and sequences reproduce process state reliably.

### Safety

A preset cannot silently change unrelated device or output configuration.

### Reliability

Source loss, decoder failure, GPU allocation failure, and output loss are visible.

### Independence

The application remains useful without the master suite.

### Composability

The application can send and receive typed signals through the suite or external video-sharing protocols.

---

## 37. Master suite quality tests

The suite is successful when:

- it can load multiple instruments without flattening their interfaces;
- routing is understandable at a glance;
- feedback paths are explicit;
- resource use is visible;
- program and preview are dependable;
- instruments can be bypassed or replaced safely;
- global presets can recall selected domains;
- recording and outputs remain stable;
- projects can survive version changes.

---

# Part XI — Long-Term Opportunity

## 38. A missing category of creative software

There is a gap between:

- VJ software;
- broadcast switchers;
- node-based visual environments;
- shader editors;
- nonlinear editors;
- projection-mapping tools;
- media servers;
- small experimental creative-coding sketches.

The proposed family could occupy a different category:

> Standalone native software video instruments with strong identities, explicit image memory, typed routing, live performance control, and optional modular composition.

This category is uncommon in current software.

The opportunity is not nostalgia alone.

The historical references reveal interaction and architecture concepts that remain underused:

```text
selectively writable image memory
masks as behavioral control
source-independent process presets
structured DVE objects
explicit program / preview state
scoped recall
standalone creative instruments
```

Modern GPUs and native cross-platform tools make it possible to recover these ideas without their original hardware constraints.

---

## 39. Final recommendation

Proceed with the modular instrument family.

Do not begin with the master suite.

Do not begin by breaking HUFF into arbitrary plugins.

First:

1. finish and stabilize HUFF’s native port;
2. identify reusable engine boundaries;
3. define the Field Store contract;
4. build the Field Store as a complete standalone application;
5. use the lessons from that application to refine the shared substrate;
6. continue with Trail Store and DVE Object;
7. build the mixer and sequence environment only after the instruments have proven their interfaces and state models;
8. build the master suite last.

The strongest synthesis is:

```text
Fairlight
image memory + stencil behavior + playable process

Magic DaVE
structured image objects + trails + sequences

INDIGO
buses + program/preview + scoped operational state

HUFF
expressive image processing + feedback + live control

Junkpile
proven native wgpu, media, routing, 3D, automation, and output experiments
```

The result should not be one universal application.

It should be a collection of focused, strange, dependable, composable video instruments that can stand alone or become parts of a larger performance system.

---

# Source foundation

This memo was developed from the prior HUFF video-instrument research and the uploaded reference materials:

- *The Fairlight CVI Computer Video Instrument*
- *Fairlight Video Entertainer User Manual*
- *Fairlight Computer Video Effects Mixer User Manual*
- *Snell & Wilcox Magic DaVE 8DOE / 4DE / 4DOE User Manual, Version 3.00*
- *Grass Valley INDIGO AV Mixer User Manual*
- the HUFF source archive
- the Junkpile example archive
- *HUFF Video Instrument Reference Study*

The historical systems are used as conceptual and architectural references. The proposed instruments are not intended as literal emulations.
