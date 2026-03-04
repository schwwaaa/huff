# huff — MIDI CC Reference

huff responds to MIDI Control Change (CC) messages on any channel (1–16).
No driver setup is needed — the Web MIDI API is used directly in the app.

---

## Setup

1. Connect a USB or Bluetooth MIDI controller before launching huff.
2. The **MIDI: ready** pill appears at the bottom-right when a device is detected.
3. Move any mapped knob/fader and the corresponding parameter responds instantly.

---

## MIDI Learn

You can remap any CC to any parameter without editing config files.

1. Click **MIDI LEARN** in the header.
2. **Right-click** the control chip you want to map (e.g. the CORRUPT % chip).
   - The chip border turns red to confirm it's armed.
3. Move a knob or fader on your controller.
4. The mapping is saved to `localStorage` and survives app restarts.
5. Press **ESC** or click **CANCEL LEARN** to exit without saving.

### Reset all MIDI mappings
Open the browser/WebView DevTools console and run:
```js
localStorage.removeItem('huffMidiCC');
```
Then reload the controls window.

---

## Default CC Map — Range Parameters

CC value `0` maps to the parameter's **minimum**; `127` maps to its **maximum**.

| Label | Element ID | Default CC | Min | Max | Description |
|---|---|---|---|---|---|
| Base Mix | baseMix | **CC 20** | 0 | 1 | Source video layer opacity |
| Feedback | feedback | **CC 21** | 0 | 3 | Frame-over-frame feedback amount |
| Persistence | persistence | **CC 22** | 0 | 10 | Buffer decay rate |
| Depth | depth | **CC 23** | 0 | 0.5 | Temporal tile-sampling depth |
| Scatter | depthScatter | **CC 24** | 0 | 1 | Per-tile temporal randomness |
| Corrupt % | corrupt | **CC 25** | 0 | 7 | Fraction of tiles displaced |
| Drift | corruptDrift | **CC 26** | 0 | 1 | Noise-driven density breathing |
| Pixel Size | block | **CC 27** | 150 | 2000 | Tile/block size in pixels |
| Speed | glitchSpeed | **CC 28** | 0 | 5 | Noise phase velocity (coarse) |
| Fine Speed | glitchSpeedFine | **CC 29** | 0 | 10 | Noise phase velocity (fine) |
| Mult | glitchSpeedMul | **CC 30** | 0 | 10 | Global speed multiplier |
| Glitch Size | glitchSize | **CC 31** | 1 | 60 | Spatial size of each displaced tile |
| Smear | glitchSmear | **CC 32** | 0 | 200 | Number of smear duplicate stamps |
| Smear Angle | glitchSmearAngle | **CC 33** | 0 | 360 | Smear trail direction (degrees) |
| Tile Opacity | glitchAlpha | **CC 34** | 0 | 1 | Alpha of each blit tile |
| Jitter | glitchJitter | **CC 35** | 0 | 1 | Per-tile position noise magnitude |
| Glitch X | glitchBaseX | **CC 36** | -400 | 400 | Base X offset for tile destinations |
| Glitch Y | glitchBaseY | **CC 37** | -400 | 400 | Base Y offset for tile destinations |
| Trail Layers | trailLayers | **CC 38** | 0 | 8 | Number of ghost trail frames |
| Trail Depth | trailDepth | **CC 39** | 0 | 1 | Temporal spread of trail ghosts |
| FB X | fbX | **CC 40** | -1 | 1 | Feedback horizontal translation |
| FB Y | fbY | **CC 41** | -1 | 1 | Feedback vertical translation |
| FB Z | fbZ | **CC 42** | 0.98 | 1.03 | Feedback zoom |
| FB θ | fbTheta | **CC 43** | -2.0 | 2.0 | Feedback rotation (deg/frame) |
| Sym Pos | symPos | **CC 44** | 0 | 1 | Mirror axis position |
| Scan Bands | clusterCount | **CC 45** | 1 | 50 | Number of scanline displacement bands |
| Scan Height | clusterRadius | **CC 46** | 1 | 20 | Scanline band thickness |
| Scan Shift | scanShift | **CC 47** | 0 | 0.5 | Scanline horizontal shift amount |
| Scan Drift | scanDrift | **CC 48** | 0 | 3 | Scanline drift speed |
| Scan Opacity | scanAlpha | **CC 49** | 0 | 1 | Scanline band alpha |
| Clu Centers | cluCenters | **CC 50** | 1 | 20 | Number of cluster tile centers |
| Clu Spread | cluSpread | **CC 51** | 1 | 300 | Radial spread of cluster tiles |
| Spatial Gap | spatialGap | **CC 52** | 0 | 200 | Min distance between tile placements |
| Sol Thresh | solarizeThresh | **CC 53** | 0 | 1 | Solarize luminance threshold |
| Sol Amount | solarizeAmt | **CC 54** | 0 | 1 | Solarize inversion strength |
| Sol R | solarizeR | **CC 55** | 0 | 2 | Solarize red channel tint |
| Sol G | solarizeG | **CC 56** | 0 | 2 | Solarize green channel tint |
| Sol B | solarizeB | **CC 57** | 0 | 2 | Solarize blue channel tint |
| Flow Strength | flowStrength | **CC 58** | 0 | 20 | Flow warp displacement magnitude |
| Flow Scale | flowScale | **CC 59** | 40 | 200 | Flow warp cell size |
| Flow Pulse | flowPulse | **CC 60** | 0 | 200 | Frames back for flow pulse source |
| Flow Implode | flowImpl | **CC 61** | 0 | 1 | Centripetal warp (implosion) |
| Quality | quality | **CC 62** | 0 | 3 | Ring buffer depth / flow skip rate |

---

## Default CC Map — Toggle Parameters

CC value `> 63` turns the toggle **ON**; `≤ 63` turns it **OFF**.

| Label | Element ID | Default CC | Description |
|---|---|---|---|
| System | corruptOn | **CC 70** | Master glitch engine on/off |
| Base Video | baseOn | **CC 71** | Source video layer on/off |
| Symmetry | symOn | **CC 72** | Mirror effect on/off |
| Scanlines | clusters | **CC 73** | Scanline displacement on/off |
| Cluster Tiles | clusterTiles | **CC 74** | Cluster tile mode on/off |
| Solarize | solarizeOn | **CC 75** | Solarize effect on/off |
| Flow | flowOn | **CC 76** | Flow warp on/off |
| Seed on load | seedOnLoad | **CC 77** | Re-seed buffer on file load on/off |

---

## Tips

- Any MIDI **channel** (1–16) is accepted — channel filtering is not applied.
- Only **CC messages** (status byte `0xBn`) are processed; Note On/Off and Pitch Bend are ignored.
- Use your controller's **LFO or step-sequencer** output routed to a CC for automated parameter motion.
- Assign the same physical knob to **multiple CCs** via your controller's editor to move several parameters at once.
