# huff — TouchOSC / OSC Reference

huff accepts OSC messages bridged over WebSocket. This allows TouchOSC (iOS/Android),
OSCQuery clients, or any OSC tool that can speak to a WebSocket relay to control every
parameter in real time.

---

## How it works

```
TouchOSC app  ──OSC UDP──▶  TouchOSC Bridge  ──WS──▶  huff (port 8000)
```

huff opens a WebSocket client connection to `ws://127.0.0.1:8000` on startup
and silently retries every 3 seconds if the bridge is not running.
The **OSC: on** pill at the bottom-right confirms a live connection.

---

## Setup

1. **Install TouchOSC Bridge** on your computer  
   Download: <https://hexler.net/touchosc#resources>  
   Launch it — it listens for OSC UDP on port **8000** by default and
   re-exposes messages over WebSocket on the same port.

2. **Configure your OSC client** (TouchOSC, OSCQuery, custom script, etc.)  
   - Target host: the IP address of your computer (or `127.0.0.1` if on the same machine)  
   - Target port: **8000**  
   - Protocol: **UDP** (TouchOSC Bridge handles the WS conversion)

3. Launch huff. The **OSC: on** pill will appear when connected.

---

## Message Format

### Text (space-delimited)
```
/huff/corrupt/ 0.42
/huff/feedback/ 0.75
/huff/flowOn/ 1.0
```

### JSON
```json
{ "address": "/huff/corrupt/", "args": [0.42] }
```

Both formats are accepted. All values are **normalized 0.0–1.0** and mapped
linearly to each parameter's native min–max range.  
For toggle parameters: value `> 0.5` → ON, `≤ 0.5` → OFF.

---

## Address Namespace

All addresses begin with `/huff/` and end with `/`.

### Range Parameters

| OSC Address | Element ID | Native Min | Native Max | Description |
|---|---|---|---|---|
| `/huff/baseMix/` | baseMix | 0 | 1 | Source video layer opacity |
| `/huff/feedback/` | feedback | 0 | 3 | Frame-over-frame feedback amount |
| `/huff/persistence/` | persistence | 0 | 10 | Buffer decay rate |
| `/huff/depth/` | depth | 0 | 0.5 | Temporal tile-sampling depth |
| `/huff/depthScatter/` | depthScatter | 0 | 1 | Per-tile temporal randomness |
| `/huff/corrupt/` | corrupt | 0 | 7 | Fraction of tiles displaced |
| `/huff/corruptDrift/` | corruptDrift | 0 | 1 | Noise-driven density breathing |
| `/huff/pixelSize/` | block | 150 | 2000 | Tile/block size in pixels |
| `/huff/glitchSpeed/` | glitchSpeed | 0 | 5 | Noise phase velocity (coarse) |
| `/huff/glitchSpeedFine/` | glitchSpeedFine | 0 | 10 | Noise phase velocity (fine) |
| `/huff/glitchMult/` | glitchSpeedMul | 0 | 10 | Global speed multiplier |
| `/huff/glitchSize/` | glitchSize | 1 | 60 | Spatial size of each displaced tile |
| `/huff/smear/` | glitchSmear | 0 | 200 | Number of smear duplicate stamps |
| `/huff/smearAngle/` | glitchSmearAngle | 0 | 360 | Smear trail direction (degrees) |
| `/huff/tileOpacity/` | glitchAlpha | 0 | 1 | Alpha of each blit tile |
| `/huff/jitter/` | glitchJitter | 0 | 1 | Per-tile position noise magnitude |
| `/huff/glitchX/` | glitchBaseX | -400 | 400 | Base X offset for tile destinations |
| `/huff/glitchY/` | glitchBaseY | -400 | 400 | Base Y offset for tile destinations |
| `/huff/trailLayers/` | trailLayers | 0 | 8 | Number of ghost trail frames |
| `/huff/trailDepth/` | trailDepth | 0 | 1 | Temporal spread of trail ghosts |
| `/huff/fbX/` | fbX | -1 | 1 | Feedback horizontal translation |
| `/huff/fbY/` | fbY | -1 | 1 | Feedback vertical translation |
| `/huff/fbZ/` | fbZ | 0.98 | 1.03 | Feedback zoom |
| `/huff/fbTheta/` | fbTheta | -2.0 | 2.0 | Feedback rotation (deg/frame) |
| `/huff/symPos/` | symPos | 0 | 1 | Mirror axis position |
| `/huff/scanBands/` | clusterCount | 1 | 50 | Number of scanline bands |
| `/huff/scanHeight/` | clusterRadius | 1 | 20 | Scanline band thickness |
| `/huff/scanShift/` | scanShift | 0 | 0.5 | Scanline horizontal shift amount |
| `/huff/scanDrift/` | scanDrift | 0 | 3 | Scanline drift speed |
| `/huff/scanOpacity/` | scanAlpha | 0 | 1 | Scanline band alpha |
| `/huff/cluCenters/` | cluCenters | 1 | 20 | Number of cluster tile centers |
| `/huff/cluSpread/` | cluSpread | 1 | 300 | Radial spread of cluster tiles |
| `/huff/spatialGap/` | spatialGap | 0 | 200 | Min distance between tile placements |
| `/huff/solarizeThresh/` | solarizeThresh | 0 | 1 | Solarize luminance threshold |
| `/huff/solarizeAmt/` | solarizeAmt | 0 | 1 | Solarize inversion strength |
| `/huff/solarizeR/` | solarizeR | 0 | 2 | Solarize red channel tint |
| `/huff/solarizeG/` | solarizeG | 0 | 2 | Solarize green channel tint |
| `/huff/solarizeB/` | solarizeB | 0 | 2 | Solarize blue channel tint |
| `/huff/flowStrength/` | flowStrength | 0 | 20 | Flow warp displacement magnitude |
| `/huff/flowScale/` | flowScale | 40 | 200 | Flow warp cell size |
| `/huff/flowPulse/` | flowPulse | 0 | 200 | Frames back for flow pulse source |
| `/huff/flowImplode/` | flowImpl | 0 | 1 | Centripetal warp (implosion) |
| `/huff/quality/` | quality | 0 | 3 | Ring buffer depth / flow skip rate |

### Toggle Parameters

Send `1.0` to turn ON, `0.0` to turn OFF.

| OSC Address | Element ID | Description |
|---|---|---|
| `/huff/system/` | corruptOn | Master glitch engine on/off |
| `/huff/baseVideo/` | baseOn | Source video layer on/off |
| `/huff/symOn/` | symOn | Mirror effect on/off |
| `/huff/scanlines/` | clusters | Scanline displacement on/off |
| `/huff/clusterTiles/` | clusterTiles | Cluster tile mode on/off |
| `/huff/solarizeOn/` | solarizeOn | Solarize effect on/off |
| `/huff/flowOn/` | flowOn | Flow warp on/off |
| `/huff/seedOnLoad/` | seedOnLoad | Re-seed buffer on file load on/off |

---

## Example TouchOSC Layout Tips

- Use **Fader** widgets mapped to each range address, value range 0–1.
- Use **Toggle** or **Push** buttons for on/off addresses.
- Group related controls on separate pages (e.g. Glitch, Feedback, Flow, FX).
- For `glitchX` and `glitchY` (which have negative ranges), the 0.5 point = 0;
  a fader at 0.0 sends -400, at 1.0 sends +400.
- `fbTheta` works the same: 0.5 = 0°, 0.0 = -2°/frame, 1.0 = +2°/frame.

---

## Alternative: Pure-Python OSC Bridge

If you don't want to use TouchOSC Bridge, run this minimal relay:

```python
# pip install python-osc websockets
import asyncio, websockets
from pythonosc import dispatcher, osc_server

clients = set()

async def ws_server(ws):
    clients.add(ws)
    try: await ws.wait_closed()
    finally: clients.discard(ws)

def osc_handler(address, *args):
    msg = f"{address} {args[0]}" if args else f"{address} 0"
    asyncio.run_coroutine_threadsafe(broadcast(msg), loop)

async def broadcast(msg):
    for ws in list(clients):
        try: await ws.send(msg)
        except: clients.discard(ws)

async def main():
    global loop; loop = asyncio.get_event_loop()
    d = dispatcher.Dispatcher(); d.set_default_handler(osc_handler)
    osc_server.ThreadingOSCUDPServer(("0.0.0.0", 8000), d).serve_forever()

asyncio.run(main())
```
