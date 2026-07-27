# HUFF Native wgpu · Milestone 17 upgrade notes

## Purpose

Milestone 17 replaces the earlier demonstration-only MIDI/OSC targets with a complete mapping layer connected to HUFF's canonical parameter and action state.

## Architecture

A new `control_mapping.rs` module owns:

- the canonical target catalog;
- action identifiers;
- target validation;
- normalized curve handling;
- number/bool/select conversion;
- toggle and trigger edge detection;
- a bounded action bus consumed by the renderer.

The MIDI and OSC workers receive clones of the canonical `ParameterStore`, `AutomationHandle`, and `ControlActionBus`. Parameter mappings update Rust state directly. The renderer sees the new revision on the following frame. Discrete actions are placed on the action bus and consumed by the render thread without sending renderer commands from device callback threads.

## Mapping behaviors

- **Absolute** continuously maps an incoming value.
- **Gate** writes false/true according to the threshold.
- **Toggle** changes a Boolean state on a rising edge.
- **Trigger** fires a canonical action on a rising edge.

Number targets use the parameter's canonical minimum and maximum. Select targets quantize the normalized value across the declared option list. Unbounded numeric parameters are excluded from the mappable target catalog.

## Portable files

Both MIDI and OSC use the schema identifier:

```text
huff-control-map/v1
```

The files contain a display name, optional notes, and the device-specific mapping list. Files are opened and saved through native dialogs.

## Correctness boundaries

- Mapping processing is bounded to 256 entries per protocol.
- Invalid targets or source types are discarded and surfaced as errors.
- Duplicate input sources are shown as warnings rather than silently removed.
- Device callback threads never own the wgpu renderer.
- Controller actions are ignored while deterministic export owns the private render graph.
- Real-device testing remains required because MIDI drivers and OSC senders vary.

## Version

```text
Application: 0.17.0
Native build: HNW-17
```
