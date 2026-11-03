# Windows desktop app

Inkvoice can be packaged as a standalone Windows application with Tauri. The
installer includes the React UI and starts the bundled Bun/Hono backend locally.
SQLite is stored in the Windows application-data directory, so the app does
not require Docker or a separate server.

## Requirements

- Windows 10 or newer
- Rust toolchain with the MSVC target
- Bun
- Tauri CLI

Install the CLI once:

```bash
bun add --dev @tauri-apps/cli
```

## Development

```bash
bunx tauri dev
```

The desktop shell uses port `3789` for its local backend. The normal web/Docker
deployment continues to use port `3000`.

## Build the Windows installer

The backend must be compiled as the Tauri sidecar expected at:

```text
src-tauri/binaries/inkvoice-backend-x86_64-pc-windows-msvc.exe
```

From a Windows build machine:

```powershell
bun build packages/backend/src/index.ts --compile --outfile src-tauri/binaries/inkvoice-backend-x86_64-pc-windows-msvc.exe
bunx tauri build
```

Or, after the sidecar has been compiled, use the repository script:

```powershell
bun run desktop:build
```

The resulting NSIS installer is written under `src-tauri/target/release/bundle/nsis`.
The MSI package is written under `src-tauri/target/release/bundle/msi`.

## Build with GitHub Actions

The repository includes a Windows workflow at
`.github/workflows/windows-desktop.yml`. It runs on `workflow_dispatch` and
whenever a `v*` tag is pushed.

To build on demand:

1. Open the repository's **Actions** tab.
2. Select **Windows desktop installer**.
3. Choose **Run workflow**.
4. Download the `inkvoice-windows-installers-*` artifact from the completed run.

The artifact contains the NSIS `.exe` installer and the MSI package. Pushing a
tag such as `v0.3.1` runs the same build automatically. This workflow does not
code-sign the installer; Windows may show a SmartScreen warning until a
trusted code-signing certificate is configured.

The workflow also runs `cargo check` before packaging, so Rust compilation
errors are reported before the longer installer build begins.

The desktop app does not register a service or require administrator access.
Each Windows user gets an isolated SQLite database under their application-data
directory. Cloud synchronization uses the existing offline queue and the sync
status control in the header.

The first Windows build must be performed on Windows (or with a configured
Windows MSVC cross-compilation toolchain), because the bundled sidecar is a
Windows executable. The current development machine has no Rust toolchain, so
it can validate the web bundle but cannot emit the `.exe` installer locally.

The GitHub Actions workflow generates the Windows icon assets from the committed
`packages/frontend/public/icon-512.png` before compiling Tauri. This keeps the
build independent of untracked or locally generated icon files.
