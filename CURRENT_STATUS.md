# Current Status

## User-confirmed direction

Scan FIELD itself is successful and should be preserved. Pass 40V improved Luma
routing/readback behavior but exposed a separate layer-presence bug when Scan,
Luma and slowed Corrupt were combined.

## Current candidate

**Pass 40W — CONTINUOUS Corrupt / Scan layer-presence repair.**

Not accepted until runtime testing confirms:
- Scan FIELD retains its successful visual character;
- Luma TARGET=SCAN remains responsive;
- enabling Corrupt no longer makes a slowed CONTINUOUS composite flash one bad frame;
- Random/Cluster Speed produce visibly slow evolution while fixed SCAN TOP or CORRUPT TOP remains stable;
- application FPS remains acceptable under the extra CONTINUOUS Corrupt draw cadence below 1x.

## Protected
- Pass 40V Luma target/cache architecture;
- Pass 40U Scan FIELD geometry;
- frozen Flow;
- merged Feedback/Persistence;
- pipeline runtime;
- decoder/output/native Tauri tree.

## Explicit boundary

Pass 40W fixes `CONTINUOUS`. STROBE/MULTIGRAB keep their explicit decoded-frame
update gates and require separate runtime evaluation when layered with Scan.
