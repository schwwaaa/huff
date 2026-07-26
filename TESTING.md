# HUFF Native Milestone 16 test checklist

Milestone 16 is primarily a parameter-contract and reproducibility milestone. It does not require the unresolved Milestone 15 export cases to be debugged before continuing.

## 1. Static contract validation

From the project root:

```bash
npm install
npm run validate:parity
```

Expected result:

```text
HUFF parity contract exact: 87/87
Native registry parameters: 98
Native-only parameters: 11
```

Any mismatch should be treated as an intentional schema change requiring review or as a regression.

## 2. Launch

macOS Metal:

```bash
npm run dev:metal
```

Windows DX12:

```powershell
npm run dev:dx12
```

Confirm the About panel shows Milestone 16 and the PARITY LAB row appears between Automation and Export Queue.

## 3. Initial comparison

Click **Compare** before changing controls.

Expected:

- contract score is `87/87`;
- contract mismatch count is zero;
- current delta is normally zero after a fresh launch with defaults;
- the tooltip lists eleven native-only controls.

## 4. Current-value tracking

Move one mapped effect slider and wait briefly.

Expected:

- `CURRENT Δ` increases;
- no contract error appears;
- moving the control back to its exact default reduces the delta again.

This confirms that the report distinguishes current artistic state from the static control contract.

## 5. Legacy Defaults

Change several controls, choose **Legacy Defaults**, and click **Apply Profile**.

Expected:

- mapped legacy controls return to their original defaults;
- the native render-resolution and history settings remain unchanged;
- persistent buffers clear;
- the current delta returns to zero.

## 6. Isolation profiles

Apply each profile separately:

```text
Glitch Isolation
Cluster Isolation
Scanline Isolation
Feedback Reference
Flow Reference
```

For each profile:

- the expected effect family becomes active;
- unrelated effect families are disabled;
- the output begins from a cleared temporal state;
- applying the same profile twice produces the same parameter state.

Visual equality with the legacy renderer is not required to advance development; record obvious differences for the later refinement cycle.

## 7. Report export

Click **Export Report** and select a destination.

Open the JSON and confirm it includes:

```text
engineBuild = HNW-16
legacyContractParameters = 87
nativeRegistryParameters = 98
exactContractParameters = 87
contractMismatchFields = 0
nativeOnlyParameters
currentDifferences
profiles
```

## 8. Automation interaction

Start automation recording, apply one calibration profile, then stop recording.

Expected:

- the profile’s parameter changes are stored as a canonical batch;
- a clear-buffers action is included;
- the clip can still be selected for deterministic export.

## 9. Regression smoke test

Perform a brief smoke test only:

- load and play a video;
- start and stop camera input;
- toggle Glitch and Scanlines;
- trigger Flow pulse;
- capture a PNG still;
- run one short H.264 deterministic export if the current local Milestone 15 path is working.

Do not block continued milestone work on previously observed high-resolution export failures. Preserve logs and failed job manifests for the later production-verification cycle.
