# Audio Splicer

A small, dependency-free web app for merging audio files and cutting and pasting between them, all in the browser. Files are decoded with the Web Audio API and never uploaded anywhere.

## Run it

Open `index.html` in a browser. It works straight from the file system (no build step or server needed), or serve the folder with any static server:

```sh
npx serve audio-splicer   # or: python3 -m http.server -d audio-splicer
```

## What it does

- **Load** any audio (or video) file your browser can decode: MP3, WAV, OGG, FLAC, M4A, and more. Drop files anywhere on the page or use *Add files*.
- **Select**: click a waveform to place the cursor, drag to select, and Shift+click to extend.
- **Cut / Copy / Paste / Delete** between any tracks. Pasting over a selection replaces it. Mono and stereo are converted automatically. *Paste as new track* turns the clipboard into its own track.
- **Crop, Silence, Fade in, Fade out** act on the selection.
- **Merge** the checked tracks, either *joined end to end* (with an optional gap; a negative gap crossfades) or *mixed together* (lowered automatically if the result would clip).
- **Undo / Redo**, plus reorder, duplicate, rename and remove tracks.
- **Export** any track as a 16-bit WAV.

### Keyboard

| Key | Action |
| --- | --- |
| Space | Play/stop (selection, or from cursor) |
| Ctrl/Cmd + X / C / V | Cut / copy / paste |
| Delete / Backspace | Delete selection |
| Ctrl/Cmd + A | Select whole track |
| Esc | Clear selection |
| Ctrl/Cmd + Z, Ctrl/Cmd + Shift + Z | Undo / redo |

## Files

- `index.html`, `styles.css`: markup and styling (light and dark themes)
- `ops.js`: pure audio-buffer operations (slice, insert, concat/crossfade, mix, fades, WAV encoder)
- `app.js`: UI, waveform rendering, selection, playback, undo history
- `tests/ops.test.js`: unit tests for `ops.js`, run with `node --test audio-splicer/tests/ops.test.js`

## Notes

- Everything is resampled to the browser's audio sample rate (usually 44.1 or 48 kHz), and exports use that rate.
- Audio is held uncompressed in memory, so very long files (hours) can use a lot of RAM.
