# HUFF Classic Pass 39N — Runtime Testing Checklist

## 1. Exact reported bug
1. Enable CORRUPT.
2. Keep MODE = CONTINUOUS.
3. Enable CLUSTERS.
4. Move CLUSTER SPEED and confirm it clearly changes cluster evolution.
5. Disable CLUSTERS.
6. Move RANDOM SPEED to `0.00x`.

Expected: Random Corrupt draws/establishes a state, then holds rather than visibly continuing at full cadence.

## 2. RANDOM SPEED continuum
With Clusters OFF, compare:
- 0.00x — hold
- 0.05x — extremely slow evolution
- 0.15x — slow evolution
- 0.50x — moderate
- 1.00x — established cadence
- 2.00x / 4.00x — faster autonomous motion/phase

The main acceptance question: does moving RANDOM SPEED visibly and predictably change the temporal character?

## 3. CLUSTER SPEED continuum
With Clusters ON, hold RANDOM SPEED at any arbitrary value and compare CLUSTER SPEED:
- 0.00x
- 0.05x
- 0.15x
- 0.50x
- 1.00x
- 2.00x
- 4.00x

Expected: Cluster evolution responds to CLUSTER SPEED independently of RANDOM SPEED.

## 4. Mode switching
Repeatedly toggle Clusters ON/OFF at very different speed settings, for example:
- RANDOM SPEED 0.05x
- CLUSTER SPEED 3.00x

Expected: the active temporal character switches immediately with the mode; the inactive speed should not dominate the current mode.

## 5. Explicit timing policies
Check STROBE and MULTIGRAB after the speed repair. Their INTERVAL / HOLD / LIVE behavior should remain intact.

## 6. Feedback regression
Use Feedback exactly as in Pass 39M. The Pass 39M Feedback functions are protected by exact source hashes in the validator.

## 7. Readability
Scan the main UI and MIDI/OSC/Syphon/Spout dialogs for neon-green text. Text should be black. Green borders/checkbox accents are allowed.

## 8. Performance
Stress:
- heavy Corrupt + Repeats;
- Clusters + Z motion;
- Feedback;
- LIVE Luma.

No performance improvement is claimed by this pass; verify no regression from the scalar speed gate/UI change.
