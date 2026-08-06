# HUFF Classic — Signing and Notarization Preparation

## macOS

### Local signing

Set either:

```bash
export HUFF_CODESIGN_IDENTITY="Developer ID Application: …"
```

or the Tauri-compatible:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: …"
```

Then run:

```bash
npm run build:mac
```

The universal assembly signs nested frameworks first, signs the final app with hardened runtime and entitlements, and runs strict `codesign` verification.

Without a real identity, the script uses an ad-hoc signature for local testing. An ad-hoc build is not a public release artifact.

### Notarization

Create a `notarytool` keychain profile, then set:

```bash
export HUFF_NOTARY_PROFILE="huff-notary"
```

The universal build submits the DMG, waits for the result, staples the ticket, and validates the staple. The standalone helper is:

```bash
scripts/macos-notarize.sh path/to/huff-1.0.3-universal.dmg
```

## Windows

The unsigned package remains usable for local testing but may trigger SmartScreen.

For a signed release, configure the signing certificate on the native Windows build host and set:

```text
HUFF_WINDOWS_CERT_THUMBPRINT
```

The preflight records whether the signing identity is present. Certificate thumbprint, SHA-256 digest, and the certificate provider's timestamp server must be configured before public release.

## Release rule

A package is not marked publicly releasable until:

```text
signature verified
installer opened on a clean target machine
application launched
camera permission tested
native output tested
checksum manifest generated
```
