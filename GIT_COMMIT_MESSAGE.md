# Ready-to-use Git commit

```bash
git add . && git commit \
  -m "fix: harden HUFF Classic output shutdown" \
  -m "Own and clear mirror reconnect timers, animation pumps, Workers, WebSockets, listeners, pending receiver frames, and staging surfaces across pagehide and beforeunload." \
  -m "Add generation-guarded Syphon and Spout start/stop lifecycles so stale native completions cannot reactivate an output after Stop or application shutdown." \
  -m "Make native shutdown idempotently release MIDI, stop the OSC UDP listener, stop Syphon or Spout, and exit the complete two-window process." \
  -m "Preserve the exact Pass 22 effects and Flow behavior, validated serial pipeline, controls, presets, decoder, frame clocks, and render-buffer topology." \
  -m "Add Pass 28 lifecycle validation, baseline manifests, endurance checklist, and complete documentation."
```
