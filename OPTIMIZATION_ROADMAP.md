# HUFF Classic Optimization / Augmentation Roadmap

1. Pass 41A playback fidelity / 1080p Classic processing boundary — **accepted**.
2. Symmetry expansion — **parked**.
3. Pass 42 LUMA QUANTIZE — **strong positive runtime response / protected**.
4. Pass 43 FLUIDITY — **strong positive runtime response / protected**.
5. Passes 44–47 Solarize/Luma UI + performance work — **retained**.
6. Pass 48 Layer Priority / Global Mix / Luma fades — **retained lineage**.
7. Pass 49 Syphon Stability Contract — **accepted**.
8. Pass 50 Worker-owned Syphon transport — **target-machine report: works well**.
9. Pass 51 720p60 bounded Syphon pipeline — **current candidate**.
10. If Pass 51 cannot sustain useful 720p60 without weakening stability, ship the same 720p-only UI with 30 fps as default rather than reopening 1080p.
11. Continue one subsystem at a time; do not reopen Flow without explicit direction.

## Pass 51 acceptance

- 1280×720/60 should be the normal healthy worker-direct route.
- Worker native outstanding depth must never exceed two.
- Transport saturation must drop output opportunities, never build delayed-frame latency.
- Receiver discovery must never regress to discoverable-but-black behavior.
- Repeated receiver connect/disconnect and Start/Stop/Start must remain deterministic.
- Worker-direct failure with 60 selected must continue through the accepted main-socket path at 720p30.
