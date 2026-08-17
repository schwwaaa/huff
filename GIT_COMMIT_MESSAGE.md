perf: pipeline Classic Syphon for stable 720p60 output

- fix HUFF Classic Syphon output to 1280x720
- make 720p60 the primary/default worker-direct target
- retain 720p30 as the safe selectable mode and automatic fallback
- remove 1080p Syphon output from HUFF Classic
- replace worker-direct native ACK gating with a strict two-credit pipeline
- allow browser capture/readback of the next frame to overlap native publication
- keep a hard maximum of two outstanding native frames
- drop excess Syphon output opportunities instead of creating a latency queue
- move direct-path ACK credit ownership and timeout recovery into the Worker
- bound Worker WebSocket buffering to approximately one additional 720p RGBA frame
- aggregate native ACK/status telemetry instead of making every ACK a controls scheduling dependency
- preserve one-frame-in-flight behavior for the accepted Pass 49 main-socket fallback
- automatically cap fallback output to 720p30 when 60 fps was requested
- preserve one-fps bootstrap discovery, lifecycle cleanup, and receiver recovery
- leave native Syphon/Metal code, effects, Luma, Solarize, Feedback, Flow and Spout unchanged
- add Pass 51 validation, pipeline simulation, profiler diagnostics and documentation

HUFF Classic Pass 51
