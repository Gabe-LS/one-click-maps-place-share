# Privacy Policy — One-Click Maps Place Share

**Last updated:** June 2026

## Data Collection

One-Click Maps Place Share does **not** collect, store, transmit, or share any personal data or browsing activity.

## What the extension accesses

The extension operates exclusively on Google Maps pages (`www.google.com/maps`). It reads:

- **Place name and address** — from the currently displayed place panel, to copy to your clipboard.
- **Short share link** — intercepted from Google Maps' own link-shortening request, to copy to your clipboard.

This information is copied to your local clipboard and is never sent to any server, analytics service, or third party.

## Storage

The extension stores a single boolean preference (debug logging on/off) using Chrome's local storage API. This data stays on your device and is automatically deleted when the extension is uninstalled.

## Permissions

| Permission | Why |
|---|---|
| `clipboardWrite` | Write place information to your clipboard |
| `storage` | Save your debug logging preference locally |
| Host access to `google.com/maps` | Read place details and intercept the share link |

## Third parties

The extension does not communicate with any external server. It does not include analytics, telemetry, or tracking of any kind.

## Contact

For questions about this policy, open an issue at [github.com/Gabe-LS/one-click-maps-place-share](https://github.com/Gabe-LS/one-click-maps-place-share).
