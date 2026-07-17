# Releasing MinutIA

This document describes the release process for MinutIA desktop app.

## Prerequisites

### Updater signing keys (required)

A key pair was generated with `pnpm tauri signer generate`.  The **public
key** is embedded in `frontend/src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`).  The **private key** file
(`minutia-updater-key.key`) and its password are configured as GitHub Actions
secrets for the `v1.0.0` release. Before running the workflow, verify that
the repository still contains both secret names:

1. `TAURI_SIGNING_PRIVATE_KEY`
2. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

> **⚠️ Keep the private key file safe.**  It is gitignored (`.gitignore`
> excludes `*.key` and `*.key.pub`).  If you lose it, you'll need to
> regenerate the pair and update the pubkey in `tauri.conf.json` — existing
> installs won't be able to update to the new key automatically.

### Code signing (optional, currently disabled)

The Windows installers ship unsigned (`sign-binaries: false` in
`release.yml`). Expect a Windows SmartScreen warning on install until a
DigiCert (or equivalent) Windows code-signing certificate is configured.
macOS distribution, notarization, and Apple certificates are outside the
scope of `v1.0.0`.

## Release Procedure

### 1. Bump the version

Update the version in **all three** files:

| File | Field |
|------|-------|
| `frontend/src-tauri/tauri.conf.json` | `"version"` |
| `frontend/src-tauri/Cargo.toml` | `version = "..."` |
| `frontend/package.json` | `"version"` |

All three must match.  The first public MinutIA release is `1.0.0`; later
releases use [semver](https://semver.org/) (for example, `1.0.1` or `1.1.0`).

> **Important:** The release workflow will **fail** if a git tag for the
> version already exists.  There is no auto-increment — you must bump the
> version manually.

### 2. Merge to `main`

All releases are cut from `main`.  Ensure your changes are merged.

#### Release scope check

This worktree contains pre-existing functional changes in the same manifest
files as the version bump. Before merging, inspect the diff against `main`
and stage the `1.0.0` version hunks, release test, and release documentation
separately from unrelated work. Do not use a blanket `git add` on the three
manifests; use `git add -p` or a dedicated release branch/commit so the
release PR has an intentional, reviewable scope.

### 3. Run the release workflow

Go to **Actions → Release → Run workflow** (manual `workflow_dispatch`).

The workflow will:
1. Check that the version tag doesn't already exist (fails if it does).
2. Create a **draft** GitHub release with tag `v<version>`.
3. Build the Windows NSIS + MSI installers (unsigned) and `.sig` files.
4. Generate `latest.json` (the auto-updater manifest) via tauri-action.
5. Upload all assets to the draft release.

### 4. Publish the draft release

> **Critical:** The auto-updater uses the `releases/latest` redirect, which
> **ignores draft releases**.  If you leave the release as a draft, the
> updater will get a 404 and no user will receive the update.

1. Go to the [releases page](https://github.com/nikopradopalma17-art/Minut_IA/releases).
2. Find the draft release for your version.
3. Review the release notes and edit if needed.
4. Click **Publish release**.

### 5. Verify the update manifest

Open this URL in a browser:

```
https://github.com/nikopradopalma17-art/Minut_IA/releases/latest/download/latest.json
```

Verify:
- The `version` field matches your release.
- The `platforms.x86_64-pc-windows-msvc.url` points to the NSIS `.exe`.
- A `.sig` file URL is present.

### 6. End-to-end update test (before publishing v1.0.1)

> **Prerequisite:** This test requires a Windows machine with Visual Studio
> Build Tools (MSVC + Windows SDK) to build the installers. Run this before
> publishing the first update after `v1.0.0`.

#### Phase A — Install v1.0.0

1. Install the NSIS `.exe` from the published `v1.0.0` release on the test
   machine.

#### Phase B — Build & publish v1.0.1

1. Bump version to `1.0.1` in the three files (`tauri.conf.json`,
   `Cargo.toml`, `package.json`).
2. Merge to `main`.
3. Run `release.yml` again.
4. Publish the draft release as `v1.0.1`.

#### Phase C — Verify the update circuit

1. Open the installed MinutIA v1.0.0.
2. Within ~2 seconds, the `UpdateDialog` should appear automatically
   (the app checks for updates on startup +2s, throttled to once per 24h).
   - If it doesn't appear, click the tray icon → "Check for updates".
3. The dialog should show "v1.0.1 is available".
4. Click "Update" — the app should:
   - Download the NSIS `.exe` from the release.
   - Verify the `.sig` signature against the pubkey in `tauri.conf.json`.
   - Install the update silently.
   - Relaunch automatically in v1.0.1.
5. Confirm the app now shows v1.0.1 in the title bar / About dialog.

#### Phase D — Smoke test (post-update)

After the update to v1.0.1, verify these critical paths:

1. **Open an external link** (e.g., privacy policy in Settings) — should
   open in the default browser, not crash.
2. **Record a meeting** — start recording, stop, verify the audio file
   was saved in `%APPDATA%\com.minutia.app\recording-*.wav`.
3. **Save & export a meeting** — export to Downloads, verify the file
   appears there (confirms `resolve_within_allowed` works).
4. **API key storage** — save an API key for a provider, close the app,
   reopen, verify the key is still there (confirms keyring works).
5. **Upgrade from plaintext keys** (if testing on a machine with an old
   Meetily install): verify that existing API keys were migrated to the
   keyring and the SQLite columns are NULL (confirms F1.2 migration).
6. **Generate a summary** — with a valid API key, generate a summary and
   verify it appears in the UI.
7. **Download a Whisper model** — download a small model (e.g., `base`)
   and verify it loads correctly.

## Rules

- **Never change the `identifier`** in `tauri.conf.json` after the first
  public release.  Tauri's auto-updater ties update continuity to this
  bundle identifier (`com.minutia.app`).
- **Never remove the NSIS target** from the bundle between versions — the
  Windows auto-updater uses it.
- **Always bump the version** before running the workflow.  The workflow
  will fail if the tag already exists, by design.
