# HUFF Classic — Capability Matrix

Use this matrix during release-candidate testing. Record actual results; do not infer them from static validation.

| Platform / machine | 720p30 light | 720p60 light | 1080p30 moderate | 1080p60 moderate | worst-case scene | native output | 60-minute soak |
|---|---|---|---|---|---|---|---|
| macOS Apple Silicon | pending | pending | pending | pending | pending | Syphon pending | pending |
| macOS Intel | pending | pending | pending | pending | pending | Syphon pending | pending |
| Windows x86_64 | pending | pending | pending | pending | pending | Spout pending | pending |
| Linux x86_64 | pending | pending | pending | pending | pending | mirror pending | pending |

## Result vocabulary

```text
PASS       stable at intended frame tier
DEGRADED   usable with measurable drops or latency
FAIL       stalled, crashed, lost output, or unusable
N/T        not tested
N/A        not supported on that platform
```

For every entry, retain:

```text
machine model
OS version
WebView/WebKit version
source codec and dimensions
active effects
profiler snapshot
output receiver
observed failures
```
