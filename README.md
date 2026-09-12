# Aurora Watch NL

A dashboard for deciding, on any given evening, whether it is worth driving north —
and how far — to see the aurora from the Netherlands.

Solar cycle 25 peaked in 2024–2026, which is why the aurora has been reaching Dutch
and even French latitudes. The limiting factor here is almost never the sun: it is
low cloud, light domes and the shortness of summer nights. So this dashboard scores
all four together, per site, per night.

![what it does](https://img.shields.io/badge/data-NOAA%20SWPC%20%2B%20Open--Meteo-2ee59d)

## Using it

**Locally** — open `index.html` in a browser. It fetches live data directly from
NOAA and Open-Meteo; nothing is installed and no API key is needed.

**Hosted** — The *Publish dashboard* workflow deploys to GitHub Pages on every push to
`main` that touches the dashboard, and switches Pages on the first time it runs.
The result lives at `https://slimrdam.github.io/Astrophotography/` — that is the
version worth bookmarking on a phone.

The page refreshes itself: live feeds every 15 minutes, and the three-night outlook
rebuilds when the date rolls over, so a tab left open on a spare screen stays honest.
Press **Alert me** once to allow browser notifications and it will tell you when a
night crosses into GO.

## What it shows

| Panel | What it answers |
|---|---|
| Verdict banner | Is any of the next three nights worth going out for, from where, and between which hours |
| Right now | Solar wind at L1 — Bz, speed, density, current Kp, OVATION oval intensity to the north. This is the 30–60 minute view you check *while* standing outside |
| Three nights | Score, Kp peak, cloud, dark window and moon per night |
| Night timeline | Kp in 3-hour blocks against the Kp *this site* needs, with cloud blocking the northern horizon underneath, twilight shading and moon-up strip |
| Where to stand | All six sites ranked for the selected night, with travel notes |
| NOAA alerts | Raw SWPC watches, warnings and alerts |

### The sites

| Site | Why | Kp for a camera | Kp for the eye |
|---|---|---:|---:|
| Lauwersmeer / Lauwersoog | Dark Sky Park, Wadden Sea due north | 4.7 | 6.0 |
| Texel — De Cocksdorp / De Slufter | Island darkness, open northern horizon | 5.0 | 6.3 |
| Afsluitdijk / Den Oever | Wadden Sea to the north, no ferry | 5.2 | 6.5 |
| Callantsoog dunes | North Sea coast, dunes block inland glow | 5.3 | 6.6 |
| Houtribdijk | Markermeer to the north, 45 min from Amsterdam | 5.4 | 6.7 |
| Amsterdam | Reference — what you lose by staying home | 5.7 | 7.0 |

Those Kp numbers are rules of thumb for ~53°N geomagnetic latitude, adjusted for how
dark each site is and how clean its northern horizon is. Kp 5 is a camera-only glow
from the islands; Kp 6 is plainly visible there; Kp 7 puts it over the whole country.
Edit `SITES` in `assets/aurora-core.js` to add your own spots or retune the thresholds
after a night that over- or under-delivered.

### The score

One number per site per night, a weighted geometric mean so that a zero anywhere is
fatal — a G4 storm behind a solid deck of stratus scores nothing.

```
score = 100 · (geomagnetic/100)^0.6 · (sky/100)^0.4 · darkness · moon
```

* **geomagnetic** — peak forecast Kp during the dark window versus what the site needs.
* **sky** — cloud blocking the northern horizon (low ×0.55, mid ×0.30, high ×0.15,
  fog overrides), scored 55 % on the clearest hour and 45 % on the median, because you
  only need one good gap.
* **darkness** — ×0.45 to ×1.0 on hours with the sun below −12°. Mid-May to late July
  the Netherlands never gets there, so June nights cap out low no matter what.
* **moon** — ×0.80 to ×1.0, by illuminated fraction × time above the horizon.

Verdicts: **GO** 70+, **WATCH** 50–69, **SLIM** 30–49, **NO** below 30. A trip to Texel
or Lauwersoog is flagged when it scores 55+ *and* beats Amsterdam by 12 points or more.

## Daily alerts

`.github/workflows/aurora-watch.yml` runs twice a day (09:00 and 16:00 local), scores
the same three nights with the same engine, and:

1. commits a snapshot to `data/latest.json` — the dashboard falls back to it when the
   live feeds are unreachable;
2. opens (or updates) a GitHub issue labelled `aurora` when a night in the next 48
   hours scores 65 or more. GitHub emails you the issue, which is the part that
   actually reaches you when you are not looking at the dashboard.

Run it by hand from the Actions tab — *Aurora watch → Run workflow* — with a lower
threshold if you want to be woken for marginal nights. Locally:

```sh
node scripts/check-aurora.js --threshold 60
```

## Layout

```
index.html                       the dashboard (self-contained UI)
assets/aurora-core.js            sites, astronomy, feeds, scoring — shared by page and script
scripts/check-aurora.js          daily job: writes data/latest.json, emits the alert
.github/workflows/aurora-watch.yml
data/latest.json                 generated snapshot (do not edit)
```

## Data

* [NOAA SWPC](https://services.swpc.noaa.gov/) — 3-day planetary Kp forecast, 1-minute
  estimated Kp, DSCOVR/ACE solar wind (Bz, Bt, speed, density), OVATION aurora model,
  alerts and watches.
* [Open-Meteo](https://open-meteo.com/) — hourly cloud layers, visibility, temperature
  and wind per site.
* Sun and moon geometry is computed in the browser; nothing is sent anywhere.

## Caveats

* The Kp forecast is a 3-hour *planetary average*. Substorms fire on their own
  schedule — an arc can appear at Kp 4 and nothing at all at Kp 6. When you are
  already outside, Bz held below −5 nT is the better signal.
* Cloud forecasts beyond about 48 hours are soft; treat night three as a heads-up.
* Everything is scored for looking **north**, low on the horizon. That is the only
  view that matters at this latitude until the display gets strong.
