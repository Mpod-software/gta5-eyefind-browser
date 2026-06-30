# Assets

Drop your branding and (optional) sound assets here. The app and the
`electron-builder` config both look for files in this folder.

## Auto-generated placeholders

`icon.ico`, `icon.png`, and `gta-pointer.png` are produced by
[`../scripts/generate-assets.js`](../scripts/generate-assets.js) — a
dependency-free generator that procedurally renders the eyeFind eye mark and a
pointer cursor. It runs automatically before `npm run dist`, and only creates
files that don't already exist, so **your own art always wins**. Replace any of
these files whenever you like; pass `--force` to regenerate fresh placeholders.

## Application icon

| File        | Platform      | Recommended size            |
| ----------- | ------------- | --------------------------- |
| `icon.ico`  | Windows       | multi-res `.ico` up to 256² |
| `icon.png`  | macOS / Linux | 512×512 or 1024×1024        |

The app also runs fine without them — `main.js` falls back gracefully when an
icon is missing.

## UI sound effects (optional)

`src/renderer.js` ships a `Sound` module that is **disabled by default**. To
enable GTA-style UI blips, add clips here and flip `ENABLED` to `true` in the
renderer:

```
assets/audio/click.wav
assets/audio/navigate.wav
assets/audio/close.wav
```

> Note: this is a fan project and is **not affiliated with Rockstar Games or
> Take-Two Interactive**. Ship only artwork and audio you have the right to use.
