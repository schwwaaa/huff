# HUFF Native Milestone 17 test checklist

Milestone 17 can be evaluated without resolving every deferred export or visual-parity issue. The goal is to confirm that controller messages reach canonical state safely and that mapping files round-trip correctly.

## 1. Launch

```bash
npm install
npm run dev:metal
```

Confirm the About panel reports Milestone 17 and both MIDI and OSC panels open without layout clipping.

## 2. MIDI device and learn

1. Open MIDI and press Refresh.
2. Select a USB controller or virtual port.
3. Connect.
4. Select `FEEDBACK · feedback.amount` as the target.
5. Press Learn Next and move a CC control.
6. Confirm a mapping row appears and the Feedback control moves in the main interface.
7. Confirm the renderer follows the canonical value rather than only showing input activity.

## 3. MIDI behaviors

- Map a button to a Boolean parameter using Gate.
- Change the row to Toggle and confirm one rising edge changes state once.
- Map a note to `flow_pulse` using Trigger.
- Set channel to `0` and confirm messages from more than one channel are accepted.
- Create two mappings from the same source and confirm a conflict warning appears.

## 4. OSC listener and learn

1. Start the listener on `0.0.0.0:9000`.
2. Select `feedback.amount` and press Learn Next.
3. Send a normalized float from TouchOSC, Max/MSP, Pure Data, or another sender.
4. Confirm the address and argument index appear in the mapping table.
5. Confirm Local Test drives `/huff/feedback`.
6. Test a message whose numeric value is in a non-normalized range and edit Input Min/Input Max accordingly.

## 5. Curves, ranges, and smoothing

For one continuous parameter:

- compare Linear and Square;
- set Output to `0.25–0.75` and confirm the parameter is restricted to the middle half of its canonical range;
- increase smoothing in the mapping row and confirm changes become slower;
- enable Invert in the mapping row and confirm direction is reversed.

Adjust Threshold for Gate, Toggle, or Trigger mappings and confirm the rising-edge point changes. The field is preserved through row edits and portable map round trips.

## 6. Portable file round trip

1. Save a MIDI map.
2. Clear mappings.
3. Open the saved map.
4. Confirm targets, source data, behavior, curves, range, enable state, and notes return.
5. Repeat for OSC.
6. Open `control-maps/factory-midi.json` and `control-maps/factory-osc.json`.

## 7. Automation interaction

1. Begin automation recording.
2. Move a mapped continuous controller.
3. Fire a mapped Flow Pulse action.
4. Stop recording.
5. Confirm the clip contains parameter and action events.

## 8. Safety and recovery

- Disconnect MIDI while moving a control; HUFF should continue running.
- Stop and restart OSC on the same port.
- Attempt to bind a port already in use and confirm the error is shown.
- Import an invalid schema and confirm it is rejected.
- Start deterministic export and verify live controller actions do not mutate the private export graph.
- Close the application with MIDI and OSC active and confirm shutdown does not hang.

## Deferred refinement

Controller-specific templates, relative encoders, 14-bit CC pairs, NRPN/RPN, MIDI output feedback, OSC timetags, and live automation playback are outside this milestone. They should be considered only after real devices establish which additions are useful.
