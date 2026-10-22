# B2B · Back to back

A desktop DJ app built with React + Electron. It reads your Serato library without
touching it, and works with the Numark Mixtrack Platinum FX.

![B2B](docs/captura.png)

## What it does

- **Reads your Serato library** (read-only): database, crates, hot cues and
  beatgrids come from `~/Music/_Serato_` and from your files' own tags. B2B never
  writes to them — cues you create here are stored separately.
- **Web Audio engine**: play, pitch, SYNC on both BPM and phase, auto loops
  quantized to the grid, hot cues, and scratching through an AudioWorklet.
- **2-channel mixer**: gain, 3-band EQ, filter, line faders, crossfader and
  per-channel CUE.
- **3-band waveforms** drawn against the beatgrid. If a track has no BPM or grid,
  B2B works them out on its own.
- **4-channel output**: with the Mixtrack, master goes out on channels 1-2 and the
  headphones (CUE) on 3-4.
- **Controller**: full mapping for the Numark Mixtrack Platinum FX, including LEDs,
  VU meters and the jog screens.

## Requirements

- macOS (tested on a 2017 MacBook Pro)
- [Node.js](https://nodejs.org) 20 or newer
- Optional: Numark Mixtrack Platinum FX

The interface is in Spanish.

## Getting started

```bash
git clone https://github.com/diegoparrap97/b2b.git
cd b2b
npm install
npm run dev
```

The first time, open ⚙︎ Settings and point B2B at two folders: your music folder
and your `_Serato_` folder.

Other commands:

- `npm run web`: the interface in a browser, with no access to your files
- `npm start`: build and open the production version

## Controller: Numark Mixtrack Platinum FX

It connects on its own when the app opens. Status shows in the bottom-right corner
and in Settings, where there's also a MIDI monitor showing raw messages.

| Control | What it does |
|---|---|
| PLAY / CUE | Play-pause. CUE: while playing, jumps back to the cue and pauses; while paused, sets the cue; on the cue, previews it while held |
| SHIFT + PLAY / SHIFT + CUE | Stutter from the cue / jump to the start |
| SYNC (SHIFT + SYNC) | Matches BPM and phase (turns it off) |
| Jog, top | Scratch (the SCRATCH button toggles it) |
| Jog, edge | Nudges the track to line up beats. With SHIFT: fast search |
| Pitch fader | ±8 %. SHIFT + PITCH BEND − cycles the range (8/16/50 %) |
| PITCH BEND + / − | Speeds up or slows down while held. SHIFT + BEND + = key lock |
| Pads – HOT CUE | Jump and play / store. SHIFT + pad = delete |
| Pads – AUTO LOOP | Loops from 1/8 to 16 beats |
| Pads – FADER CUTS | Pads 1-4 cut the channel while held |
| LOOP, ½, ×2 | Auto loop, halve, double. SHIFT + ½ / ×2 = loop in / loop out |
| Mixer | Gain, EQ, filter, volume, crossfader, CUE, cue mix and master |
| BROWSE | Turn: move through the list. Press: switch between crates and tracks. LOAD 1/2 loads |

**The pitch fader uses soft takeover**: it won't grab control until its physical
position matches the current pitch, so the track never jumps. While it waits, the
pitch percentage blinks yellow.

**The jog screens need SysEx permission**, which the system only grants off a
click. If they stay blank, or the controller starts running its light show (demo
mode), open ⚙︎ Settings → Controller and hit "Activar pantallas del jog".

## Not there yet

- Effects (FX buttons and paddles)
- Sampler
- Real key lock — right now, changing the tempo also shifts the pitch

## Credits and license

The MIDI mapping for the Mixtrack Platinum FX — control numbers and the jog-screen
format — is based on the open mapping in
[Mixxx](https://github.com/mixxxdj/mixxx), which is free software under GPL-2.0+.
B2B is therefore released under the same license: **GPL-2.0-or-later** (see
[LICENSE](LICENSE)). Thanks to the Mixxx team and to everyone who documented this
controller.

Typefaces: [Sora](https://fonts.google.com/specimen/Sora) and
[IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono), both under the
SIL Open Font License.

## Notice

B2B is an independent project, not affiliated with or endorsed by Serato or Numark.
It reads Serato's files read-only through publicly documented formats. "Serato" and
"Numark" are trademarks of their respective owners and are named here only to
describe what B2B works with.
