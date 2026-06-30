# eyeFind

A high-fidelity Grand Theft Auto V browser replica built on Electron. Developed by Mpod-software.
> [!TIP]
> 🎮 **Looking to just play around with the browser?**
> If you want to use the application without touching the source code, simply go to the **[Releases](./releases)** section and download the latest setup installer (`.exe`)!

## Quick Start

Install dependencies:

```bash
npm install
```

Launch the app:

```bash
npm start
```

## Production Build

Build a fully functional Windows installer (`-setup.exe`) into `dist/`:

```bash
npm run dist
```

> [!WARNING]
> **Windows symlink error during `npm run dist`** — if the build fails with
> `A required privilege is not held by the client`, run your terminal as
> **Administrator**, or enable **Windows Developer Mode**
> (*Settings → Privacy & security → For developers → Developer Mode*), then
> re-run the build.

---

© 2026 Mpod-software. All rights reserved.
