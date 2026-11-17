# Gleamward — Seven Nights of Light

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/rebahan149/best-game-02-entry/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/rebahan149/best-game-02-entry/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Gleamward** is a light-beam defense game that runs entirely in the browser.
A hearth-lantern at the edge of a dark field throws a single beam of light.
Shadow creatures creep in from the night to snuff it out — your only weapon
is the light itself. Drag and rotate mirror shards to bend the beam across
the field, hold the burning lanes where the shadows must walk, and keep the
hearth alive for **seven nights**.

## The game

- **Bend light, not bullets.** The beam reflects off every mirror shard with
  real 2D ray-reflection physics. A well-placed pair of 45° shards makes a
  periscope; a careless one lights up empty grass while a brute eats your
  hearth.
- **Seven seeded nights.** Every night's wave — composition, spawn order,
  timing, entry edge — is generated from a fixed seed, so runs are
  reproducible and scores are comparable. Swifts join on night 2, wisps on
  night 3 (and the dark starts slipping in from the top and bottom edges),
  brutes on night 4.
- **Embers economy.** Burned shadows drop embers. Between nights, spend them
  at dawn on more mirror shards, a hotter or wider beam, a polished lens
  (extra reflection + reach), hearth plating, a frost charm that slows the
  creep, or a quick rekindle.
- **Four shadow kinds.** Shades (steady), swifts (fast, fragile), wisps
  (sine-weaving), and brutes (slow, very hungry).

## Controls

| Input | Action |
| --- | --- |
| Drag a mirror | Move it |
| Mouse wheel over a mirror | Rotate it |
| Q / E (or the ⟲ ⟳ buttons) | Rotate the selected mirror |
| Double-click a mirror | Nudge it 15° |
| Drag the lantern / A / D | Aim the beam |
| F (or the Flare button) | Flare: 5 embers for a 3.5 s double-damage surge (12 s cooldown) |
| P or Esc | Pause |

## Run it

No build step, no dependencies — it is a static site with a zero-dependency
Node entrypoint:

```sh
# recommended: the bundled Node server (Node >= 22, nothing to install)
node main.ts                  # then visit http://localhost:8080

# or just open the file…
open index.html

# …or serve the folder with Python
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Tech

- Vanilla JavaScript + Canvas 2D. Zero libraries, zero assets, zero build.
- `js/beam.js` — the reflection model (ray/segment intersection, reflection,
  multi-bounce beam tracing, point/segment distance). Pure functions with no
  DOM access; it also loads in Node (`module.exports`) so the physics can be
  unit-tested headlessly.
- `js/game.js` — game state, seeded wave generation, input, the dawn upgrade
  shop, rendering (additive glow beam, particles, HUD), and the
  title / shop / win / lose flow.
- `index.html` + `style.css` — the page, overlays (title, dawn shop, end
  screens), and the dark lamplight theme.

## License

MIT — see `LICENSE` (SPDX-License-Identifier: MIT).
