# AnyoneCanPace

**Run together. Walk together.**

Tools for volunteer pacers leading beginner-friendly group runs. Part of the **AnyoneCanRun (ACR)** initiative by **Les Stooopids**.

The app always opens on **"What are we doing today?"**, a mode picker (`…/?sunday` opens Stooopid Sunday (for linking from another website); a route link opens straight on that route: every route page has its own address, `…/?route=<id>`, to copy from the address bar or send with **SHARE ROUTE**):

- **Stooopid Sunday Dashboard**: what to wear for the Sunday run and where we meet, any other run time on request, and the Sunday story.
- **ACR Run/Walk Timer**: open the URL on your phone, tap **START PACING**, and the app alternates RUN and WALK until you stop it. Adjust intervals mid-run without interrupting the group.
- **Route Library**: pick a route (they range from about 4.6 to 12.4 km) and follow it on a street map, with the duck marking your place, a direction banner and turn cues.

The app doesn't remember the last mode, so it always starts here. Your timer intervals and other settings are still remembered. To change modes, use **Settings → Switch mode** in the timer (two taps while a session is running), or **MODES** in the route library and dashboard.

**Live site:** https://anyonecanpace.pages.dev/ · **Beta (testing):** https://anyonecanpacebeta.pages.dev/ (Cloudflare Pages; see "Deploying")

---

## ACR Run/Walk Timer

- **RUN / WALK alternation** that runs indefinitely, starting with RUN. Defaults: 90 s RUN, 60 s WALK.
- **Big, glanceable display**: huge phase label, MM:SS countdown with tabular digits, a Duck Gold progress ring with the running duck riding its leading edge, and a "NEXT:" hint. RUN is Crew Navy, WALK is Track Blue, and the phase is always spelled out, so colour is never the only cue.
- **Distraction-free focus mode**: only Pause/Resume, Edit Intervals and Skip are visible while pacing.
- **Mid-run edits**: ±15 s steppers (15 s – 30 min). A change applies to the **next** occurrence of that phase. The running countdown is never reset, paused or restarted.
- **Pause / Resume / Skip**: Resume continues from the exact remaining time. Skip jumps to the full opposite phase, and a paused session stays paused.
- **End & reset** lives in the Settings sheet and needs two taps, so it can't happen by accident.
- **Sound cues**: two short high beeps for RUN, one long low beep for WALK. They are synthesized with Web Audio, so there are no audio files.
- **Vibration cues** on supported devices (most Android browsers).
- **Screen Wake Lock** while a session is active, re-acquired when you return to the page.
- **Works offline** after the first visit, and can be installed to the home screen. Installing is optional.
- **Remembers your settings** (RUN, WALK, sound, vibration) in local storage. No accounts, tracking, cookies or analytics.
- **Accessible**: semantic HTML, labelled controls, visible focus, touch targets of 44 px or more, reduced-motion support. Screen readers hear RUN, WALK, Paused and Resumed, not every second.

## Route Library

- **Library**: the duck asks "Where are we running today?" (in Comic Sans, see "Typography and licensing"). Each route card shows the name, where it is ("Downtown → Old Port"), distance and kind with a time estimate ("6.4 km loop · ~48 min"), the climb in words ("Mostly flat", "Some gentle hills"; exact numbers are on the route page), tags such as **Shape run** or **Waterfront**, a "⚠ Unverified directions" warning when nobody has checked the turns, and a small outline on a faint street grid. A checked route says so (who and when) on its route page, before START ROUTE.
  - **Settings** (gear next to MODES): **your pace** for the time estimates, picked from 6:00, 6:45, 7:30 (default), 8:30 and 10:00 min/km, and **Sort routes** (A–Z, the default; Shortest first; Least climbing first, ties by name). Both are saved on the phone. **Show routes** filters the list (Shape runs, Under 5 km, Flat, Waterfront, 10 km+; only filters that match a route are offered). The filter lasts for the visit only, and a "Showing … routes · Show all" line says when one is on.
  - The offline map status only takes space at the top when it needs attention (not saved, saving, outdated, failed). Once the map is saved it's a quiet "✓ Works offline" line at the bottom.
- **Route page**: map preview, stats, elevation profile, turn list, notes, advisories and **START ROUTE**.
- **Follow view**:
  - A street map with the duck at your GPS position, always (on route, off route and going rogue), facing the route's direction. A blue accuracy halo around it shows how precise the fix is. Off route, the map keeps the duck and your place on the route both in view.
  - A direction banner, always with text: "Right on Boulevard Saint-Laurent in 150 m", "Continue on … for 1.2 km", "Left now on …".
  - One stats line: "3.2 km done · 2.8 km to go".
  - No timer and no progress ring.
- **Starting**:
  - Before you start, the banner says "Head to the start: 420 m" with an arrow and a compass direction.
  - Anywhere within about 250 m of the start counts as "at the start".
  - **START ANYWAY** is always there, so a pacer who joins mid-way is placed where they are on the route.
  - **Joining is never a guess.** Near the start, the beginning of the route wins, even on a loop whose finish is nearby; if you really are on a later part near the start (finishing), tap **JOIN AT x KM**. Where several parts of the route pass the same spot (an out-and-back, overlapping laps), the app waits until a few reliable fixes show which way you're moving, or you tap **JOIN AT x KM**.
- **Progress only moves forward.** Each GPS fix is matched only to the stretch of route just behind or ahead of you, never to the nearest point overall. Routes can overlap themselves (the sample loop's finish is 37 m from its start), and GPS jitter or a short gap won't throw you around.
- **Turn cues**:
  - A heads-up about 150 m before each turn and a "now" cue at about 30 m. Each fires once.
  - Vibration patterns: one pulse for left, two for right, one long buzz for a U-turn. Matching beeps play if Sound is on, so iPhones (no vibration) still get a cue.
  - Screen readers hear turns, not distance ticks.
  - A turn you passed during a GPS gap (no *usable* fix for 10 s or more, counting a stretch of fixes worse than 60 m) is skipped silently. Missed cues are never replayed.
  - One cue per moment: an immediate turn always wins over a heads-up for a later one. Close turns are said together ("Left on Rue A now, then right on Rue B in 60 metres"), and each announcement names its own turn and distance.
  - **GPS warning:** when no usable fix has arrived for over 10 s (or only rough ones), a gold "GPS lost" / "GPS too rough" alert appears under the banner and the banner is greyed out, so frozen directions never look current.
  - If one jittery fix cuts a sharp corner and jumps just past a turn (up to 60 m, no gap), the "now" cue still fires, a moment late rather than never.
- **Off route**:
  - Triggers after about 5 s more than ~30 m from the route.
  - You get a dashed warning banner that points back toward the route, the duck turns into the confused duck with a "?", a buzz, and **"Going rogue?"**. **YES, ON PURPOSE** ("Gewww awaeyyy!") calms the banner (the duck stays confused until you're back on the route); **NO, GUIDE ME BACK** ("Am stooopidly lost. Finding my way back.") just closes the dialog and keeps the warning. Short labels first so they're quick to read mid-run; the Stooopids line sits underneath. Pressing Start while you're more than 30 m from the route also shows the confused duck (on your GPS dot, with "Head to the route") until you join it, without the buzz or the dialog.
  - Answer yes and the app stops nagging until you're back on the route.
  - **Rejoining further along** (a shortcut, a skipped section, a long detour): back near the route ahead of where you left it, the app offers **JOIN AT x KM**, and locks back in by itself once a few fixes show you're moving along the route in its direction (about 25 m). It never rejoins behind you, never for a street that just crosses the route or when you go the wrong way along it, and never assumes the finish stretch (on a loop that leads back to the start): that one needs **JOIN AT**. Turns you skipped stay silent.
- **Finish**: triggers near the last point, only after about 90 % of the distance is covered.
- **Ending a route** needs **MENU → END ROUTE** and a second tap. The phone's back gesture opens that menu instead of leaving mid-route.
- All of these distances and times are named constants in `src/nav/constants.ts`.

### Adding or editing a route

Source GPX files live in `routes/` and are committed. The app ships only the processed files in `src/data/routes/`, never the raw GPX.

**The easy way: the route editor.** Run `npm run dev` and open `/anyoneCanPace/?edit`. It does everything below through forms, writes the same files, and you review and commit them as usual (see "Route editor" below). The steps here are what it does, and how to do it by hand.

1. Put the GPX in `routes/` and add an entry to `routes/routes.config.json` (id, file, name, source credit).
2. Run `npm run routes`. For each route, the script (`scripts/build-routes.ts`):
   - removes the routing tool's tiny dead-end spurs and duplicate points (a real out-and-back turnaround is kept)
   - simplifies the line to about 5 m while keeping corners
   - measures the distance and classifies the route (loop, out-and-back or point-to-point)
   - looks up bare-earth elevation every 10 m and cleans it (see "Elevation" below)
   - proposes turns from heading changes and fills street names from OpenStreetMap (see "Turn suggestions" below)
   - writes `<id>.json`, `<id>.geojson` and `manifest.json`, plus a review report in `routes/review/<id>.md` (and `.json`)
3. Edit `src/data/routes/<id>.json` by hand: `name`, `startStreet`, and each turn's `dir`, `street` and `note`. Also `notes`, `advisories`, `verification`, the library's `place` (where it is, e.g. `"Downtown → Old Port"`) and `tags` (ids from `src/data/route-tags.json`: `shape-run`, `good-first-route`, `waterfront`, `canal-path`; add new ones there with a label and one of the tones `gold`, `green`, `blue`), and an optional `description` for the route page (plain text, at most 280 characters). Re-running the script keeps these hand edits and copies `place` and `tags` into `manifest.json`, which the library list reads (`description` stays in the route file). `npm test` fails on an unknown tag, an invalid tag list or description, or a manifest out of date.
   - **Turns are tied to the geometry.** Each turn's `atM` is a distance along one particular track, so the file stores a fingerprint of the processed track (`geometry`). If the GPX changes, the build **stops** for that route instead of keeping distances that now point at the wrong places. Rebuild with `npm run routes -- --reset-turns`: turns are regenerated from the new track, and hand-written street names and notes are carried over to new turns within 25 m of the old ones (by position on the ground, not distance). Old turns that matched nothing are listed in the console and the review report to fix by hand. Fresh proposals are always in `routes/cache/<id>.proposed-turns.json` for comparison.
   - Changing the geometry or the turns sets `verification` back to `unverified` (see below).

Elevation comes from Natural Resources Canada's [Canadian Digital Elevation Model](https://open.canada.ca/data/en/dataset/7f245e4d-76c2-4caa-951a-45d1d2051333) (CDEM) through the GeoGratis elevation API, and only at build time. Street names come from OpenStreetMap through the Overpass API. Both lookups are cached in `routes/cache/`, so `npm run routes -- --offline` rebuilds without a network. Turn directions are first guesses: always check them against the map and the review report.

#### Elevation

Code: `scripts/lib/elevation.ts` (pure, tested in `elevation.test.ts`).

- **Bare earth, not rooftops.** Until November 2026 the build used Open-Meteo's Copernicus GLO-90, a 90 m *surface* model: it measures roofs and tree tops. Downtown that gave the Sample Loop 127 m of climb (10–87 m raw). Two independent bare-earth models (NRCan's CDEM and the `dtm` layer of NRCan's elevation service) agree on about 45 m, and three surface models (Copernicus, NRCan's `dsm`, SRTM) all give 119–148 m, whatever the processing. No filter can take the buildings out of a surface model, so the source changed. The old samples are kept in `routes/cache/<id>.elevation-copernicus.json`, and the review report shows them for comparison.
- **Processing, all measured in metres along the route:**
  1. Runs of identical values (a nearest-cell DEM sampled more densely than its grid) become one point per cell, joined by straight lines, so the profile has no stairs.
  2. Spikes: a Hampel filter replaces a value only when it's further from the median of the values within 1.5 cells either side than both 3 robust standard deviations and the DEM's error. One bad cell is outvoted; a steady climb is untouched.
  3. A moving average two cells wide removes ups and downs shorter than the grid can represent (the sampling theorem).
  4. Climb and descent use hysteresis: a change of direction only counts once the elevation has moved by more than the DEM's point-to-point error (2 m) plus its 1 m rounding, and every confirmed climb counts in full.
  5. Missing values are bridged with straight lines and reported. With no data at all, the build stops rather than writing 0 m.
- **Limitations.** The CDEM is built from older survey data at about 20 m resolution. NRCan publishes no single point-to-point accuracy for it, so 2 m is assumed. Bridges, tunnels and overpasses are shown at ground level, not at the height you actually run. Expect a few metres of uncertainty in the totals: the Sample Loop is 44 m with this method and 45–47 m from other bare-earth data.

#### Turn suggestions

Code: `scripts/lib/turns.ts` (pure, tested in `turns.test.ts`). Every candidate turn, with its decision and the reason, goes to `routes/review/<id>.md`. Lines marked "yes" need checking. None of it is verified.

1. **Candidates:** points where the heading over 20 m before and after changes by 35° or more. Curves gentler than about a 65 m radius never qualify.
2. **One manoeuvre:** candidates less than 40 m apart are grouped, because the app couldn't announce them separately anyway ("now" at 30 m, plus 10 m of grace past a turn). Each group is measured from its approach leg to its exit leg (30 m each):
   - net change under 35° and the route stays within 20 m (about one Montréal street width) of the straight line: a **jog** (a crossing, lane or sidewalk change). Rejected, but reported.
   - a clear net change and the route stays within 20 m of a single corner: **one turn** (consolidated).
   - the exit is parallel to the approach but further to the side: a **dogleg**, or **round a short block**. Two instructions, the first move and the last.
   - anything else: one instruction for the net change, flagged as **complex** (loops, ramps).
3. **Kept even when it looks redundant:** a turn that stays on the same street (flagged "same street": a bend, or a turn that stays on it), and a small kink or jog where the named way changes (it may be a fork).
4. **Start:** a turn within 30 m of the first point is folded into the start. The start street is named from the first leg only, and stays empty when no street matches there.
5. **Street names:** matched per leg, only to OpenStreetMap streets running the same way as the route (within 35°), so a cross street at a corner doesn't win. A name change on its own never creates a turn.

All routes so far were drawn with [On The Go Map](https://onthegomap.com) on OpenStreetMap data:

| Route | Source GPX | After cleaning | Climb |
|---|---|---|---|
| Sample Loop | `onthegomap-6.4-km-route.gpx` | 6.36 km loop, 4 spurs removed | +44 m |
| Pi Day | `onthegomap-4.7-km-route.gpx` | 4.61 km loop, 4 spurs removed | +25 m |
| Canal Test | `onthegomap-12.5-km-route.gpx` | 12.36 km loop along the Lachine Canal, 2 spurs removed | +11 m |

(Climb is the bare-earth CDEM figure the app shows, from `src/data/routes/<id>.json`; the review report also lists the raw and surface-model numbers. Sample Loop and Canal Test are **field-verified** (run as a crew following the app, 2026-11-05); Pi Day is **unverified**.)

### Route editor (dev only)

A page for adding and editing routes without touching JSON: `npm run dev`, then http://localhost:5173/anyoneCanPace/?edit. It is only part of the dev server: `src/main.tsx` loads it when `import.meta.env.DEV`, its file API is a Vite plugin with `apply: 'serve'`, and `scripts/check-bundle.ts` fails the build if any of it reaches `dist/`. Code: `src/dev/routeEditor/` (pure rules in `edits.ts`, `turnEdit.ts`, `review.ts`, `deletion.ts`; the server in `server/`).

- **Add a route:** drop a GPX, name it (the id is made from the name), pick the source (On The Go Map, Strava, Garmin or other, with an optional "drawn by" credit given only with that person's OK), say whether it was drawn on a map or recorded on a run, and confirm the start and finish are public places. The GPX is **cleaned before it's saved**: only latitude, longitude and elevation are kept, and timestamps, heart rate, device data, waypoints and the file's own names are dropped (`scripts/lib/sanitize-gpx.ts`), because the repository is public. Then `npm run routes` runs. A recorded run is marked `"recorded": true` in `routes.config.json`, and its review report and turn list say to check every turn closely (GPS wobble looks like turns).
- **Details:** name, place, description, tags (and new tags, in the existing colours only), notes, start street. Only changed fields are sent; the server checks them with the same rules as the tests and rebuilds offline to refresh the manifest. A save whose rebuild fails is undone.
- **Turns:** a map with the route and numbered turns next to the turn list. Click the route to add a turn (where the route passes a spot more than once, it asks which pass); edit distance, direction, street and note; delete. Each turn shows what the build said about it, flagged ones in red, and build suggestions with no turn nearby are listed with ADD.
- **Advisories** for the route, with km range, dates and a source link.
- **Review:** marking a route desk-reviewed or field-verified needs a reviewer, a date and ticking what was actually checked. It is saved on its own, never with other edits, so it's always a review of the saved turns. The editor then shows the line to add to the reviewed list in `src/nav/verification.test.ts`; it never edits that test, so `npm test` fails until a person adds it. Changing turns or the start street sets a reviewed route back to `unverified`.
- **Delete** (at the bottom of a route's page): lists every file that would go, and is blocked while code or data still names the route (tests, the simulator, advisories), so the three shipped routes can't be deleted from here. Type the route's name to confirm. Nothing is destroyed: the files and a copy of the config move to `.cache/route-editor-trash/<id>-<time>/` (ignored by git).
- **Map coverage:** a route partly or fully outside `public/maps/montreal.pmtiles` gets a warning to run `npm run map` and bump `MAP_VERSION`.

Only this computer can use it. The API answers only loopback addresses with a `localhost` host name (so not other devices when `dev:https` listens on the network, and not tunnels), only with the editor's own request header, and writes only from the editor page itself. One save or build runs at a time.

### Reviewing and releasing a route

Every route carries a `verification` record in `src/data/routes/<id>.json`, shown in the route list and on the route page before START ROUTE:

| Status | Means | Needs |
|---|---|---|
| `unverified` | Turns are the automatic suggestions (or edits nobody has signed off). The app says so and asks pacers to watch the street signs. | Nothing |
| `desk-reviewed` | Someone checked every turn, street name and note against a map or street imagery. Not walked. | `reviewer`, `date` |
| `field-verified` | Someone walked or ran the whole route following the app, and fixed what was wrong. | `reviewer`, `date` |

A test (`src/nav/verification.test.ts`) rejects a reviewed status without a reviewer and date, dates in the future, and unknown fields. It also fails if a route claims a review that the test's list doesn't expect, so marking a route reviewed is a deliberate, visible change in a pull request. Never set a status for checks that didn't happen.

Process for a new or changed route (the route editor, `?edit` on `npm run dev`, does steps 1 and 2 through forms):
1. **Build:** add or update the GPX, run `npm run routes` (with `--reset-turns` if the geometry changed). The route is `unverified`.
2. **Desk review:** open `routes/review/<id>.md`. For every turn marked "yes" (and the start street), compare with a map and street imagery; fix `dir`, `street`, `note` and `startStreet` in the route file. Check the climb looks plausible. Check advisories' km ranges if the geometry changed. Try it at a desk with the simulator (`/?sim=<id>` on `npm run dev`). Then set `"verification": { "status": "desk-reviewed", "reviewer": "<name>", "date": "YYYY-MM-DD" }` and add the id to the reviewed list in `verification.test.ts`.
3. **Field check:** on the beta, follow the route on a phone on foot (see the field-testing checklist). Note every wrong, late or missing cue, fix the file, and repeat until a clean pass. Then set `field-verified` with who and when.
4. **Release:** open a pull request with the route file changes; CI runs tests, type checks and a production build. Push to the beta first, then merge to `main` for the live app.
5. **Any later change** to the GPX or the turns resets the status to `unverified`; go through steps 2–3 again.

### The street map

- **Vector tiles**: a self-hosted [PMTiles](https://protomaps.com/docs/pmtiles) file, `public/maps/montreal.pmtiles`. It is a 13.2 MB extract of south-central Montréal (about 8 × 13 km, from the Plateau and Mile End down the Lachine Canal past Angrignon, zoom 0–15) from the [Protomaps](https://protomaps.com) daily OpenStreetMap build, drawn with MapLibre GL JS in the brand colours.
- **Labels**: street-name glyphs (Noto Sans Medium, SIL OFL) are self-hosted in `public/maps/fonts/` and precached, so labels work offline. No sprites are used.
- **Re-cutting the map**: run `npm run map` after adding a route outside the current map. It downloads the `pmtiles` CLI into `.cache/tools/` if needed, and covers every route in `src/data/routes/` plus about 1.1 km around them. Use `npm run map -- --bbox=W,S,E,N` for a fixed area instead.
  - The whole island (`-73.98,45.40,-73.47,45.71`) is about **55 MB**, which is too big for a one-time download on a phone. Prefer a box around the routes.
  - After re-cutting, bump `MAP_VERSION` in `src/sixk/map/offlineMap.ts` so phones fetch the new file.
- **Offline**: the map file is not cached piece by piece. The first time you open the route library (online, and not in data-saver mode), the whole file is saved to the phone's Cache Storage, and the map then reads from that copy. The library shows the status honestly ("Map saved for offline use on …", "Saving… 40 %", "not saved") with a **SAVE MAP FOR OFFLINE** button. The map shows "Online map (not saved for offline)" while it is streaming from the network.

## Stooopid Sunday Dashboard

- **Layout: Sunday first.** The top card is the Sunday run: the date and start time, then the dressed duck with its "feels like" sticker, the outfit headline (the layers), an "Also:" line for the rest (gloves, hat, reflective gear…), one weather line (air temperature, because it decides the clothes, then sky, chance of rain and wind; feels-like is the sticker on the duck), any "Run cold?" options, weather and ground notes and what to bring, then where we meet with OPEN MAP. Weather numbers are folded under **Weather details**. Until the forecast reaches Sunday the card says which day the outfit shows up instead. **Running another time?** comes next: closed, it's one line ("Today 10 a.m. · 14 °C · Tee, shorts."); open, it has the hour strip and a full outfit card. It starts closed once Sunday has an outfit and open before then, and the choice is never remembered. **Post the Sunday story** (MAKE STORY, COPY MAP LINK) is below, for whoever posts it. A fresh "Updated …" line and REFRESH sit at the bottom; an offline, failed or old forecast moves that line to the top. With no advisories there's one "No route advisories. Last checked …" line; active ones show as a card at the top.
- **Weather at run time.** Pick when the run starts from a strip of hour chips (6 a.m. to 9 p.m., three days; radio buttons, so arrow keys and screen readers work). The default is the next **10 a.m.** that isn't on the Sunday run's day (`DEFAULT_RUN_HOUR` in `src/weather/runTime.ts`). The details show conditions, air and feels-like temperature, the chance of rain or snow, wind and gusts, wind chill or humidex when they matter, and sunrise and sunset.
- **The duck dresses for it.** The mascot wears the running outfit's visible pieces: legs, the outermost top, hands, head, neck, and a vest and headlamp in the dark, with rain or snow falling behind it (off for reduced motion). Inner layers (thermal top, insulated jacket), "Run cold?" options, things to bring and footwear are text only. It's decoration, hidden from screen readers; the text carries the meaning. To swap a piece, see `src/assets/duck-outfit/README.md`.

**What to wear** (full rules and where each number came from: `design/weather-v1-spec.md`). An easy 45–60 min community run, the same for the 6K and ACR run/walk. One runner's calibration, kept in tables at the top of `src/weather/outfit.ts` (`CUTOFFS`, `ACCESSORIES`, `HEAT`, `WIND`, `WET`, `GROUND`, `FROSTBITE`, `WAITING`).

- **Clothes follow the air temperature.** Feels-like, wind chill and humidex are only for warnings and display, so wind is never counted twice.

| Air temperature | Default |
|---|---|
| 25 °C and up (or humidex 30+) | Singlet, shorts |
| 12 to 25 °C | Tee, shorts |
| 7 to 12 °C | Long sleeve, shorts |
| 2 to 7 °C | Long sleeve, tights |
| −5 to 2 °C | Long sleeve, light jacket, tights |
| −12 to −5 °C | Thermal top, light jacket, tights |
| Below −12 °C | Thermal top, insulated jacket, windproof shell, winter tights |

- **"Run cold?"** From each cutoff to 2 °C above it, the colder choice is offered as a line of text (e.g. at 7–9 °C: "Run cold? Wear tights instead of shorts.").
- **Accessories:** light gloves at 5 °C and below, ear headband at 0 °C and below; at −10 °C mittens, toque and neck warmer replace them (thermal socks suggested). Never a cap.
- **One outer layer.** Wind (sustained 25 km/h; gusts alone don't count), rain and cold all ask things of one outer layer, so it's never a windbreaker and a rain shell. Windy: a note only from 15 °C, a windbreaker from 2 to 15 °C, a windproof light jacket from −8 to 2 °C, the winter outfit below −8 °C. Rain: nothing from 15 °C unless heavy (then a light shell), a rain shell from 2 to 15 °C, and below 2 °C a waterproof shell over the warm layers. Wet snow (−2 °C and up) counts as wet; dry snow changes no clothes. A chance of rain alone is a note, not gear.
- **Ground:** forecast words only ("Paths may be slippery", "Possible refreeze", freezing-rain warning), never a claim about a route, never on the duck.
- **Bring:** a warm layer for the 10–20 min wait at 0 °C and below, or up to 5 °C when wet or windy; dry clothes for after when it's that cold or cool and wet.
- **Warnings:** frostbite at wind chill −27 or colder (stated neutrally: organisers decide), heat advice at humidex 30 and stronger at 35, reflective vest and headlamp in the dark.

**Sunday run.** The dashboard's top card says when and where the weekly run meets (next Sunday, meet 10:00, start 10:15, Café Tranquille's entrance). **COPY MAP LINK** (in Post the Sunday story) copies a Google Maps link to the exact spot for Instagram's Link sticker (if the phone won't copy, the link is shown to copy by hand); **OPEN MAP** opens it. Edit `src/data/event.json` to change the day, times or place (a test checks it), then re-make the story's map picture with `?meeting-map` (below).

**Sunday story.** Under Post the Sunday story, **MAKE STORY** (from Wednesday, when the 5-day forecast reaches Sunday; more than 3 days ahead it's labelled an early forecast to check again on Saturday) draws a two-page 1080 × 1920 Instagram story. The look is the home screen's: the sunset sky over graph paper, cream cards with a hard shadow, navy pills and white titles with a navy outline. **Page 1, the poster:** SEE YOU SOON!, the date and times on a navy pill, the dressed duck big with a "Dress like me!" speech bubble (Comic Neue, the free Comic Sans look-alike) and a gold "(Beta)" tag, a weather sticker beside it (air temperature, feels-like, sky, and wind or wet when they matter), what to wear in words (the layers, then "Also: …"), the most important note (a warning, else what to bring), a welcome for newcomers ("New here? You're welcome! Run/walk friendly · No experience required.", bigger whenever the duck still gets its full size), and "Stooopid Run Crew" with a small forecast time and credits in the footer. The duck shrinks only as far as it must to fit long cold-weather outfits. **Page 2, the map:** "Lost? Find your Flock!", the place and the times on one navy ribbon, the meeting-point map, a photo of the spot labelled "View from Rue St. Catherine." (`src/assets/story/meeting-photo.webp`, 1280 × 720, metadata stripped), and empty space at the bottom for the Link sticker. The map and photo shrink together to fit. Both are drawn in the phone with the Canvas API from one snapshot taken at the tap: the previews, **SHARE** (both pages to the phone's share sheet: Instagram, Save Images…) and **SAVE PAGE 1 / 2** all use those same pictures, and a forecast refresh doesn't change them until **REMAKE**. Pressing and holding a preview also saves it. Post them in order and add the map link with a Link sticker on page 2 (COPY MAP LINK). Layout: `src/story/layout.ts` (pure; tests check every scenario fits Instagram's safe area with no clipped or overlapping text, the duck stays at least `DUCK.min`, and page 2 keeps room for the sticker), drawing: `src/story/render.ts`, loaded only when used. Dev-only `?story-sheet` draws both pages for example weathers.

**Review pages (dev only).** `npm run dev`, then `/anyoneCanPace/?duck-sheet`: every outfit scenario (`src/weather/scenarios.ts`, the 16 approved ones badged) on the dressed duck, a playground, and a print layout for reviewing with other runners. `/anyoneCanPace/?meeting-map`: draws the meeting point on the app's offline map with a pin, street names and the OpenStreetMap credit; **SAVE TO REPO** writes `src/assets/story/meeting-map.webp`. Neither page is in production builds.

**Weather source.** [Open-Meteo](https://open-meteo.com)'s Environment Canada GEM endpoint (`https://api.open-meteo.com/v1/gem`), five days (`FORECAST_DAYS`; the dashboard's hour picker shows only the first three, the rest is for the Sunday story) plus the past day (for snow on the ground and refreeze), for fixed central-Montréal coordinates. The data is free for non-commercial use under CC BY 4.0 and credited on the page.

**No sun or UV advice.** GEM has no UV index, and the earlier estimate (from the sun's height and cloud cover) was removed along with sunglasses, so the outfit never mentions sun protection.

**Requests and offline.**
- The forecast is fetched when the dashboard opens or comes back into view, only if the saved copy is more than 30 minutes old. **REFRESH** fetches it on demand.
- The last forecast is kept on the phone, with "Updated 7:42 a.m." shown.
- Offline, or if the request fails, the page uses the saved forecast and says when it's from. It adds "may be out of date" after 6 hours.
- If there is no forecast, or it no longer covers the coming hours, the page says **Check outside**.

## Advisories

Short notices about a route (a closure, a detour, stairs) or about every run. They show on the route page (that route's notices, then general ones) and in the dashboard's **Route advisories** (all of them), each as text with where, when and a source link, plus "Last checked" for the list.

**Adding a notice:** edit `src/data/advisories.json` in a pull request. Set `lastChecked` to today, and add to `notices`:

```json
{
  "id": "commune-sewer-2026-11",
  "route": "sample-loop",
  "text": "Rue de la Commune Ouest closed for sewer work. Use the north sidewalk.",
  "fromKm": 1.1,
  "toKm": 2.1,
  "start": "2026-10-30",
  "end": "2026-11-06",
  "source": "https://donnees.montreal.ca/dataset/info-travaux"
}
```

- `route` is a route id (`sample-loop`, `pi-day`, `canal-test`) or `"global"`.
- `fromKm`/`toKm`, `start`/`end` and `source` are optional. Dates are inclusive, in Montréal time.
- A notice shows from its `start` and **disappears by itself** after its `end`. Without an `end` it stays until removed.
- `npm test` checks the file and explains any mistake in plain words (bad date, unknown route, duplicate id). CI runs the same check.
- A route's own `advisories` list in its JSON still works, but the central file is easier to review.

**Automatic road-closure flags (researched, not built).** Montréal publishes road works daily as open data ("Entraves et travaux en cours", `info-travaux`, CC BY 4.0, no key needed). Each item is a single point with a date range and a separate list of impacts (street closed, lane, sidewalk closed or narrowed, bike path). On 2026-11-04 about 1,700 items were active. Within 25 m of each route there were 14 (Sample Loop), 18 (Pi Day) and 5 (Canal Test), mostly sidewalk work and parking-lane obstructions. Keeping only street closures, closed sidewalks and closed bike paths left about 6, 7 and 2. Limits:
- Points, not street segments, so cross streets near an intersection give false positives.
- There is no link to each individual permit.
- The time stamps look shifted by a time-zone bug, so only the dates are trustworthy.
- The Lachine Canal path itself isn't covered.
- Québec 511's open feed covers only provincial highways (it flagged the Ville-Marie tunnel under the Sample Loop, a false positive), and Montréal's real-time closures feed currently returns 404.

A daily GitHub Action could build a "possible closures" file from this, with the caveats that scheduled workflows can be delayed and are switched off after about 60 days without repository activity. It is not built until the crew decides it's worth it.

## Privacy and offline

- No analytics or tracking. **Accounts are being built** (see [Accounts](#accounts-in-development)): they are off on the live site and, until they launch, the live app has no backend, accounts or cookies.
- **Your GPS position stays on your phone.** It is held in memory for the current route only. It is never stored, logged or sent anywhere, and the map tiles come from the app's own files, not a map service.
- **The only request the app makes to another site** is the Sunday dashboard's weather request to `api.open-meteo.com`, for **fixed central-Montréal coordinates, never your location**. The request goes straight from your phone to Open-Meteo, so like any web request it shows them ordinary connection details (your IP address, browser and time of the request); your GPS position is never part of it. GPS positions stay on the phone, in memory, for the current route only. It is made only when you open the dashboard and the saved forecast is more than 30 minutes old (or you tap REFRESH). Everything else is the app's own files. Elevation and street-name lookups happen only when a developer runs `npm run routes`, never in the app.
- After one visit, the timer, routes, stats and map work offline. Anything that can go stale shows when it was saved.
- Saved on the device: timer settings, the offline map and the last weather forecast.

## Accounts (in development)

Optional accounts so pacers and runners can keep their own routes across devices. The full design is `design/backend-v1-spec.md`; this is step 1 (sign-in, first-time setup, recovery code, settings). **Off on the live site**: the account screen is only in the dev server and in builds made with `ACCOUNTS=1`.

- **Sign-in is Auth0's page**, handled by our server: `/api/auth/login` sends people to Auth0, `/api/auth/callback` comes back, and the server sets its own `HttpOnly` session cookie (`acp_session`, 60 days, renewed when used). No Auth0 code runs in the app. Tested from an installed iPhone app (spec §12).
- **Server code** is in `server/` (`handler.ts` is the whole API; `db.ts` is the only place with SQL; `auth0.ts` talks to Auth0) and runs as a Cloudflare Pages Function (`functions/api/[[path]].ts`) with a D1 database (`migrations/`). It never ships in the app; `scripts/check-bundle.ts` checks.
- **What's stored** (D1): username, display name, role, a hash of the recovery code, and one row per signed-in device (a hash of its token and a label like "iPhone · Safari"). Emails and passwords stay at Auth0. Nothing about GPS.
- **First-time setup** asks for a unique username, a display name and "I'm 14 or older", then shows a recovery code once. The code (3 tries a day per username) gives a one-time password-reset link from Auth0 without email, signs every device out, and is replaced at the next sign-in.
- **Personal routes (step 2, in progress).** The server side is built: `/api/me/routes` saves, lists, opens, edits and deletes the signed-in person's own routes (25 for runners, 50 for pacers), and `/api/lookup/elevation` and `/api/lookup/streets` pass GeoGratis and Overpass lookups through for a route being built on the device (`server/routes.ts`, `server/lookups.ts`). Routes are built on the device, so the server checks what arrives instead of rebuilding it: the route editor's field rules, sizes, that track and route agree, and a GPX with positions only. Building on the device is done too (`src/myRoutes/build.ts`, sharing `scripts/lib/build-route.ts` with `npm run routes`, whose output is unchanged): the GPX is cleaned on the device, elevation and street names come through the server (by area, with retries; a route builds without street names if Overpass is too busy), and unsaved drafts stay on the device. **Adding a route** works from the account screen (My routes → ADD A ROUTE FROM A GPX): trim the start and end near home, build, check the turns with the route editor's turn screen, name it, save. **Following them:** the Route Library shows *All routes / My routes* when you're signed in; your routes open and follow like any other, without a share link, and are kept on the device for offline use once opened (deleted on sign-out). Before deploying to beta, run `migrations/0002_personal_routes.sql` in the beta D1 console (without comments). Before deploying this to beta, run `migrations/0002_personal_routes.sql` in the beta D1 console (without comments).
- **The home screen** has YOUR ACCOUNT; nowhere else does, so signing in (which leaves the app) can't interrupt a timer or a route.

### Running accounts locally

`npm run dev` serves the same API under `/api/` (`scripts/vite/accountsApi.ts`), on a local SQLite file (`.cache/accounts-dev.sqlite`) standing in for D1. It needs `.dev.vars` (git-ignored; copy `.dev.vars.example`) with the settings of a **development** Auth0 tenant, never the live one:

1. Auth0 → Applications → Create Application → **Regular Web Applications**. Allowed Callback URLs `http://localhost:5173/api/auth/callback`, Allowed Logout URLs `http://localhost:5173/anyoneCanPace/`, Credentials → Client Secret (Post), Connections → only the development user database (`local-dev-users`; Google off). Its Client ID and Secret go in `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET`. Locally, after a recovery-code password reset, Auth0 doesn't send you back: return to the app yourself (see below).
2. Auth0 → Applications → Create Application → **Machine to Machine**, authorised for the **Auth0 Management API** with `read:users`, `delete:users` and `create:user_tickets`. Its ID and Secret go in `AUTH0_M2M_CLIENT_ID` / `AUTH0_M2M_CLIENT_SECRET`.
3. `RECOVERY_PEPPER`: any long random string. `ADMIN_AUTH0_ID`: your own Auth0 user ID, once you've signed up (optional).

Without `.dev.vars` the account screen says accounts aren't available; the rest of the app is unaffected. Deleting `.cache/accounts-dev.sqlite` starts over.

### On Cloudflare

**Beta is set up** (2026-11-12): D1 database `anyonecanpace-beta`, Auth0 user database `beta-users` with the apps "AnyoneCanPace beta" and "AnyoneCanPace beta server" (in the same Auth0 tenant as live; the account can't have a second tenant, so each environment has its own user database and apps). Live isn't set up yet.

Each Pages project needs its sign-in app's **Application Login URI** set to `https://<site>/api/auth/login` (Auth0 then offers "Back to AnyoneCanPace" after a recovery-code password reset; Auth0 ignores return addresses on its current pages and only accepts HTTPS here), a D1 database bound as `DB` (migrations applied with `wrangler d1 migrations apply`), the settings above as environment variables (secrets encrypted), `APP_BASE=/`, and `ACCOUNTS=1` in its build variables. Live and beta use separate D1 databases and separate Auth0 user databases and apps. After changing a variable: **Save**, then Deployments → ⋯ → **Retry deployment** (settings only apply to new deployments). The D1 console turns line breaks into spaces, so paste SQL without `--` comments.

## Tech stack

React 19 · TypeScript · Vite 8 · plain CSS · `vite-plugin-pwa` (Workbox) · Vitest + Testing Library. No backend.

The Route Library adds **MapLibre GL JS** and the **PMTiles** reader. They are loaded only when a route map is shown, so opening the app (picker and timer) never downloads or runs them. `npm run build` runs `scripts/check-bundle.ts`, which fails the build if either library appears in the first-load bundle, and prints two different totals:

- **Entry (first-load):** what the browser downloads and runs to open the app.
- **Service worker precache:** everything the installed app downloads *in the background* so it works offline, lazy chunks included. Lazy loading keeps code from running (and from blocking the first screen), not from being downloaded once the app is installed.

| Bundle (minified, Nov 2026) | Size | gzip |
|---|---|---|
| Entry JS (picker + timer) | 235 kB | 74 kB |
| Route Library chunk (lazy) | 39 kB + 8 kB CSS | 13 kB |
| Sunday dashboard chunk (lazy) | 31 kB + 5 kB CSS | 17 kB |
| MapLibre + PMTiles chunk (lazy) | 1,088 kB + 71 kB CSS | 298 kB |
| MapLibre worker (lazy) | 519 kB | |
| **Service worker precache, total** | **52 files, about 2.8 MB** | |
| Street map file (saved on demand, not precached) | 13.2 MB | |

The map libraries sit in their own vendor chunk (`codeSplitting` group in `vite.config.ts`), so app updates that don't touch them don't download them again.

```
src/
  Root.tsx                Mode picker (always the first screen); lazy-loads the route library and dashboard
  App.tsx                 The ACR timer (unchanged, plus "Switch mode" in Settings)
  timer/engine.ts         Pure timestamp-based interval logic (no clocks, no React)
  timer/clock.ts          Monotonic session clock with sleep correction
  nav/                    Pure route following: geo, route, tracker, banner, constants
  sixk/                   Route Library: library, route page, follow view, hooks, styles
  sixk/map/               MapLibre map, brand style, offline map file (lazy)
  weather/                Pure: GEM request/parsing, outfit rules, run time, cache
  dashboard/              Stooopid Sunday Dashboard UI, OutfitView, useForecast, dressed duck (dashboard/duck/) (lazy)
  advisories/             Pure notice filtering/validation and the shared NoticeList
  assets/duck-outfit/     Duck base drawing + one SVG per outfit item (drafts; see its README)
  data/advisories.json    Hand-edited notices (changed by pull request)
  data/routes/            Processed routes (JSON + GeoJSON + manifest), hand-editable
  hooks/                  useIntervalTimer, useWakeLock, useGeolocation
  lib/cues.ts             Beeps and vibration (timer and route cues)
  lib/prefs.ts            localStorage preferences
  components/             TimerDisplay, EditPanel, MenuSheet, ModePicker
routes/                   Source GPX, routes.config.json, cached lookups
scripts/                  build-routes, cut-map, check-bundle, dev-cert
public/maps/              montreal.pmtiles and label glyphs
```

### Timing design

The timer never counts down by subtracting 1 every tick. While a session is active it stores only the moment the current interval ends (`endsAt`), and the remaining time is always `endsAt − now`. Ticks (every 250 ms) only refresh the screen, so late or throttled ticks cause no drift. Each new interval starts exactly where the previous one ended, not when the tick happened to run.

`now` comes from `performance.now()`, which is monotonic, so changing the phone's clock or time zone doesn't affect the timer. Some phones stop that clock while the device sleeps, so it is cross-checked against `Date.now()`, and any sleep gap over 1 s is added back. When the page becomes visible again, the engine applies every interval boundary that passed while it was hidden and shows the correct phase. Missed beeps are **not** replayed. A cue only plays for a change that happened in the last 2 seconds while the page was visible.

## Local development

Use **Node 26** (the version in `.nvmrc`, also used by CI and the deploy; `package.json` `engines` says the same). The scripts in `scripts/` are TypeScript run by Node directly.

You need Node.js 22.18+ (CI uses the current LTS). The scripts in `scripts/` are TypeScript run directly by Node, `npm run build` included.

```bash
npm install
npm run dev        # http://localhost:5173/anyoneCanPace/
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Run all unit and integration tests once |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript checks |
| `npm run build` | Type-check, build the production site into `dist/`, and check the first-load bundle |
| `npm run preview` | Serve `dist/` as the production build, for testing |
| `npm run routes` | Rebuild processed routes from `routes/*.gpx` |
| `npm run map` | Re-cut the street map extract |
| `npm run dev:https` | Dev server over HTTPS on your Wi-Fi (for GPS on a phone) |
| `npm run preview:https` | Production build over HTTPS on your Wi-Fi |

### Testing on a phone (GPS needs HTTPS)

**Simulate a run at your desk (dev only).** `npm run dev`, then open http://localhost:5173/anyoneCanPace/?sim, pick the Route Library → Sample Loop → START ROUTE. A dashed panel on the right edge fakes the GPS: **▶ RUN / ❚❚ PAUSE**, speed **×1 / ×3 / ×10** (×1 is about 6:00 /km), **GO OFF** (drift 80 m to the side to see the off-route banner, the confused duck and "Going rogue?") and **↺** to restart. Options: `?sim=pi-day` for another route, `&away=300` to begin 300 m from the start (to see "Head to the start" and the not-yet-joined duck), `&speed=10`. It only exists in `npm run dev` (`src/dev/simulateGps.ts`); production builds don't contain it.

Browsers only give GPS to secure (https) pages. A phone loading `http://<laptop-ip>:5173` gets **no GPS**. Two ways round it:

1. **A tunnel (most reliable; the service worker works too).** Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (a separate program, not an npm package), run `npm run dev` (or `npm run build && npm run preview`), then in another terminal:

   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```

   Open the printed `https://….trycloudflare.com/anyoneCanPace/` on the phone (use port 4173 for preview). `ngrok http 5173` works the same way. `vite.config.ts` already allows these hosts. The tunnel URL is public while it runs, so stop it when you're done.
2. **Self-signed HTTPS on your Wi-Fi.** `npm run dev:https` makes a certificate with `openssl` (in `.cache/dev-cert/`, nothing installed) and prints `https://<laptop-ip>:5173/anyoneCanPace/`. The phone warns about the certificate once: tap through ("Show details → visit this website" on iPhone, "Advanced → Proceed" on Android). GPS works after that. Browsers refuse service workers on a self-signed certificate, so test offline behaviour with the tunnel or on the deployed site.

Service workers only register in `npm run preview` (or `preview:https`), not in dev. Wake lock and installing also need HTTPS.

## Deploying

The app is hosted on **Cloudflare Pages** (see below), which builds and deploys on every push to `main`. GitHub Pages was used first and is now off: a GitHub Pages project site lives under `<owner>.github.io`, so its address led to the owner's personal site. `.github/workflows/deploy.yml` is its old deploy workflow; it is disabled and can be deleted.

<details><summary>The old GitHub Pages setup (no longer used)</summary>

`.github/workflows/deploy.yml` type-checked, tested, built and deployed on every push to `main`.

**One-time setup:** in the repository, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

The site is served at `https://<owner>.github.io/<repo>/`. `vite.config.ts` reads the repository name (from `GITHUB_REPOSITORY` in Actions, or `git remote get-url origin` locally) and sets Vite's `base`, the manifest's `start_url`/`scope` and the service worker scope to match. A `<owner>.github.io` repository is served from `/` instead. You can override this with `BASE_PATH=/something/`.

**Note:** GitHub Pages on a private repository needs a paid GitHub plan (Pro, Team or Enterprise). On a free account, make the repository public to use Pages.

</details>

**Pull requests** run `.github/workflows/ci.yml`: type check, tests, production build (with the bundle check) and `npm audit --audit-level=high`. It never deploys. Both workflows use Node from `.nvmrc` and pin each GitHub Action to a verified release commit (the comment says which release); bump the SHA and comment together. Pushing workflow changes needs gh's `workflow` scope.

**Dependency audit (Nov 2026).** `npm audit` reports 4 moderate and 2 low findings, all in the PWA build chain (`vite-plugin-pwa` → `workbox-build` → `glob`/`minimatch`, and `@rollup/plugin-node-resolve` → `deepmerge`). They run only on the developer's machine or CI while generating the service worker, on the project's own config and files; none of this code ships to phones. The only automatic "fix" downgrades `vite-plugin-pwa` to 1.1.0, so it isn't applied: `glob`'s fix is three majors away from the range `workbox-build` declares, and `deepmerge` has no fixed release. Re-check when `vite-plugin-pwa` or `workbox-build` release updates. CI fails on any high or critical finding.

### Hosting on Cloudflare Pages

Why: a GitHub Pages project site lives under `<owner>.github.io`, so its address leads to the owner's personal site. Cloudflare Pages gives a neutral address (`<project>.pages.dev`), needs no visitor login, allows commercial use, and the free plan is enough.

The build is the same. Differences are handled in `vite.config.ts` and `public/_headers`:
- `CF_PAGES` (set by Cloudflare) makes `base` `/`. Anywhere else, `BASE_PATH=/pace/` builds for a sub-path.
- `BETA=1` labels a build as Beta when the path can't say so.
- `public/_headers` stops `sw.js`, the manifest and `index.html` being cached (so phones see updates), and caches hashed `/assets/*` for a year. GitHub Pages ignored this file.

**Setup (dashboard, one project per site):**
1. Cloudflare → Workers & Pages → Create application → **Continue to Pages** (the small "legacy Pages" link; the main flow creates a Worker, whose address includes the account's workers.dev name) → connect the GitHub repository.
2. Build command `npm run build`, output directory `dist`.
3. Environment variables: `NODE_VERSION` = the version in `.nvmrc` (check the build log that it is used) and `BASE_PATH` = `/` (so the base is the root even where Cloudflare's clone has a git remote).
4. Live project: production branch `main`. Beta project: connect the beta repository and also set `BETA` = `1`.
5. Later, a custom domain or the community's subdomain (`pace.<their-domain>` as a CNAME to the project) is added under the project's Custom domains. No rebuild is needed.

**Installed apps are tied to their address.** Moving from one address to another means people reinstall and lose their saved pace and the offline map copy, so settle the final address before many people install.

GitHub Pages is already off in both repositories (Pages deleted; Actions disabled on the beta repo, only `deploy.yml` disabled on the main repo so CI keeps running), so the old `github.io` addresses return 404. To undo: re-enable the workflow and Pages with the **GitHub Actions** source.

### Checking the live site

1. In Cloudflare, open the project's **Deployments** and wait for the latest one to succeed.
2. Open https://anyonecanpace.pages.dev/ and check the timer starts.
3. Reload once, then turn on airplane mode and reload again. The app should still open.

### Updates

**Which build is this?** The home screen footer shows "Build 2026-11-06 · 3bf6256": the build date and the short commit. A crew member (or a bug report) can read it to say exactly which version is running, and compare it with the latest deployment. `vite.config.ts` fills it from `CF_PAGES_COMMIT_SHA`, `GITHUB_SHA` or local git.

The app never reloads itself mid-session. When a new version has been downloaded, a gold **A new version of the app is ready · UPDATE** banner appears at the top of every screen (home, Sunday dashboard, timer, Route Library), but never while a timer session is running or paused or a route is being followed; it comes back when that ends. An installed app left open checks for a new version when it starts and whenever you come back to it (at most once a minute) (preview the banner in dev with `?update-banner`). Closing and reopening the app also picks up the new version.

## Installing on a phone (optional)

- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ menu → **Install app** / **Add to Home screen**.

Phones don't announce this themselves (iOS never does, Chrome on Android rarely), so on phones the home screen shows a small **Add it to your home screen** hint under the modes: an **INSTALL** button when the browser offers its own prompt (`beforeinstallprompt`, caught at startup in `main.tsx`), the Share steps on iPhone/iPad, the browser menu otherwise. It's hidden when the app already runs from the home screen and after **NOT NOW** / **GOT IT** (remembered in localStorage on that phone). Logic: `src/lib/installHint.ts` (pure) and `src/lib/installPrompt.ts`; UI: `src/components/InstallHint.tsx`.

## Browser limitations

- **Keep the page open and the screen on.** Phones pause web pages when locked or in the background. Timers and sounds can't run then, and no browser app can promise otherwise. The countdown catches up when you return, without replaying missed beeps.
- **Wake Lock** keeps the screen on in Safari 16.4+ and Chrome/Edge. It doesn't stop you locking the phone manually, and the system can still release it (for example in low-power mode). If it isn't available, the app says so. Set your phone's Auto-Lock to "Never" while pacing.
- **Sound** starts after your first tap (browser rule). On iPhone, the ring/silent switch may mute web audio.
- **Vibration** isn't supported by iPhone Safari, so the toggle is disabled there.
- **GPS only works in the foreground.** Locking the phone or switching apps stops location updates; the route follow view says so before you start. When you come back, progress catches up from the next fix (within a forward limit), and turns you passed meanwhile are skipped, not replayed.
- **GPS accuracy** in downtown streets is often 10–30 m. Off route needs more than ~30 m for ~5 s, and fixes worse than 60 m are ignored for progress, so expect the occasional late or early cue near tall buildings.
- **The map needs WebGL.** On the rare phone without it, the Route Library still shows directions and distances, just no map.
- **The weather is for central Montréal**, an hourly model forecast, not a reading outside your door. Glance outside too.
- **Cache Storage can be cleared** by the browser when the phone is low on space (more likely on iPhone if the app isn't installed). The library then shows "not saved" again. Installing the app to the home screen helps.

## Typography and licensing

The design reference was **Spacilo Mono** by RagamKata Studio. Its free download is a demo for personal use only with a limited character set. Using it on a public website needs a paid webfont license (and an app license for an installed app). So the app uses an openly licensed alternative.

Three openly licensed fonts were compared: **JetBrains Mono**, **Space Mono** and **Martian Mono**, all under SIL OFL 1.1. **JetBrains Mono** is the closest match. Like Spacilo, it has rounded-square bowls, a tall x-height and clean neo-grotesque shapes, and its variable weights go up to 800 for the heavy RUN/WALK label. Space Mono is rounder and more retro, and Martian Mono is wider and chunkier.

- **JetBrains Mono** © 2020 The JetBrains Mono Project Authors, licensed under the [SIL Open Font License 1.1](src/assets/fonts/JetBrainsMono-OFL.txt).
- Self-hosted WOFF2 files (Latin and Latin Extended subsets) are in `src/assets/fonts/` and precached for offline use.
- **The duck's speech bubble** in the Route Library uses the device's own **Comic Sans MS** where it exists (Windows, macOS). Comic Sans is Microsoft's and can't be shipped with the app, so everywhere else (iPhone, Android) the bubble uses **Comic Neue** Bold, a Comic Sans lookalike: © 2014 The Comic Neue Project Authors, [SIL Open Font License 1.1](src/assets/fonts/ComicNeue-OFL.txt), from [Fontsource](https://fontsource.org/fonts/comic-neue) 5.3.0. One Latin WOFF2 file (~19 KB) in `src/assets/fonts/`, declared in the Route Library's CSS, so it's only downloaded by devices without Comic Sans when the library opens, and precached for offline use.

## Beta channel (testing on a phone before release)

The live app only changes when `main` is pushed. Unreleased work can be tried on a phone from a separate **beta** repository, [ShereenElaidi/anyoneCanPace-beta](https://github.com/ShereenElaidi/anyoneCanPace-beta), served by Cloudflare Pages at **https://anyonecanpacebeta.pages.dev/**.

- It is the same code. The beta project sets `BETA=1` (a base path containing "beta" also works), which makes the build say **Beta**: the BETA tag on the picker, "AnyoneCanPace Beta" as the tab title and home-screen name, and "ACP Beta" as the short name.
- It has its own address (origin), so its service worker, cached files, saved settings and update prompts never touch the live app. A beta nested inside the live path would be caught by the live app's service worker, which is why it's a separate project.
- The two apps are on different origins, so on one phone they share nothing: each has its own timer intervals, forecast and saved map.
- To update the beta from a feature branch (Cloudflare builds it from the beta repo's `main`):

  ```bash
  git push beta feature/dressed-duck-advisories:main
  ```

  Use whichever branch is current. Never push the beta remote's history back to `origin`.

## Map, data and font credits

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Vector tiles from the [Protomaps](https://protomaps.com) basemap build.
- The sample route was drawn with [On The Go Map](https://onthegomap.com).
- Elevation: Natural Resources Canada, Canadian Digital Elevation Model, used at build time only. Contains information licensed under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada).
- Map label font: Noto Sans © The Noto Project Authors, SIL OFL 1.1 (`public/maps/fonts/OFL.txt`).
- Speech bubble font: Comic Neue © 2014 The Comic Neue Project Authors, SIL OFL 1.1 (`src/assets/fonts/ComicNeue-OFL.txt`).
- MapLibre GL JS (BSD-3-Clause) and PMTiles (BSD-3-Clause).
- Weather: [Open-Meteo.com](https://open-meteo.com) (CC BY 4.0), from Environment and Climate Change Canada's GEM model.

## App icon

The running-duck mascot (source: `design/duck-mascot.webp`) is used for every icon in `public/`:

- **Home-screen icons** (`apple-touch-icon.png`, `pwa-192x192.png`, `pwa-512x512.png`): the whole duck on Pavement.
- **`maskable-512x512.png`**: the duck drawn smaller, so Android's circle and squircle crops don't clip it.
- **`favicon-16x16.png`, `favicon-32x32.png`**: the head only, so it stays readable at tab size.

Phones that already installed the app may keep the old icon for a while. Android refreshes it automatically. On iPhone, remove the app from the home screen and add it again.

## Manual field-testing checklist

Automated tests cover the timer logic and UI flows. These need a real phone on a real run:

- [ ] **Sunlight:** RUN/WALK and the countdown are readable at arm's length in direct sun, at full and at auto brightness.
- [ ] **Sweaty hands:** PAUSE, SKIP and the ±15 s buttons work with damp fingers and while jogging. No mis-taps on neighbouring buttons.
- [ ] **Wake lock:** the screen stays on for a full 20+ minute session (iPhone Safari, iPhone home-screen app, Android Chrome, Android installed app).
- [ ] **Audible cues:** beeps are audible over traffic and chatter, with the phone in a hand and in a pocket or armband. Check the iPhone silent switch.
- [ ] **Vibration** (Android): noticeable while running.
- [ ] **Mid-run changes:** shorten RUN mid-interval. The current RUN finishes unchanged and the next one is shorter.
- [ ] **Accidental taps:** pocket the unlocked phone for a minute. Nothing reset (End needs two taps).
- [ ] **Interruptions:** take a call, switch apps and lock the phone for 2–3 minutes. On return the phase and time are correct, and there's no burst of old beeps.
- [ ] **Duck:** the running duck is visible and sits on the end of the gold arc on both RUN and WALK, including at 15 s intervals and in the installed app (iPhone Safari too).
- [ ] **Battery:** note battery use over a 45-minute session with the screen on.
- [ ] **Offline:** start a session in airplane mode after one earlier visit.
- [ ] **Install:** add to home screen on iOS and Android. The icon, name, standalone display and portrait layout all look right.

### Dressed duck and advisories: check

- [ ] **The duck matches the list:** for a few run times (morning, evening, a rainy hour) the duck wears what the text says. Rain or snow falls behind it only when the list mentions rain or snow.
- [ ] **Reduced motion:** with the phone's "Reduce motion" on (iPhone: Settings → Accessibility → Motion), the falling rain or snow is gone.
- [ ] **Readable without the duck:** cover the duck with your thumb. The advice still makes complete sense.
- [ ] **A notice:** add a test notice for a route in `src/data/advisories.json` with tomorrow as `start`. It doesn't show today, shows tomorrow, and disappears the day after its `end`.

### Stooopid Sunday Dashboard: field check

- [ ] **First open online:** "Updated <time>" and an outfit appear within a few seconds. The run time defaults to the next 10 a.m.
- [ ] **Run time:** it defaults to the next 10 a.m. Pick tonight and tomorrow morning: the outfit changes (reflective vest when it's dark).
- [ ] **Offline:** in airplane mode, reopen. It shows "Offline: showing the forecast from …" and the same outfit. With storage cleared and offline, it shows "Check outside".
- [ ] **Does the outfit match reality?** For a few weeks of runs, note the air temperature, wind and rain, what the app said and what you actually wore. Tune the tables in `src/weather/outfit.ts`.
- [ ] **Readable** at arm's length outdoors. The list makes sense without the duck.
- [ ] **No location prompt** ever appears on the dashboard.

### Route Library: field test on the real loop

Take a charged phone outside to walk or jog the sample loop, after one online visit. Use the deployed site or a tunnel, not plain http.

- [ ] **Offline map:** the library says "Map saved for offline use". In airplane mode the route page and follow view still show streets and labels.
- [ ] **GPS permission:** the first START ROUTE asks for location. If you refuse, the banner says how to allow it.
- [ ] **Approach:** from about 500 m away the banner says "Head to the start: N m" and the arrow and compass word point the right way on the north-up map. Within about 250 m it says "You're at the start".
- [ ] **Start anyway:** start the route mid-way. Progress begins where you are, and earlier turns don't buzz.
- [ ] **Turn cues:** every turn gives a heads-up at about 150 m and "now" at about 30 m, once each. Left is one buzz, right two, U-turn long (Android). With Sound on, the beeps match (iPhone too).
- [ ] **Turn list accuracy:** note every turn that is missing, extra, in the wrong direction or has the wrong street, then fix them in `src/data/routes/sample-loop.json`. Start with the lines marked "yes" in `routes/review/sample-loop.md`: where the route really starts (the first 46 m have no street name), the dogleg at the Rue Mill junction on Rue de la Commune (2.15 and 2.23 km), the bend at 2.52 km and the Peel/Sherbrooke corner.
- [ ] **Forward only:** stand still for a minute and walk on both sides of the street. The duck never goes backwards and the km done never drops.
- [ ] **Start/finish ambiguity:** at the start, walk back and forth between the start and finish (37 m apart) before leaving. It must not say Finished.
- [ ] **Off route:** walk one block off the route. Within about 5–10 s you see the dashed banner, the confused duck with its "?", a buzz and "Going rogue?". "No" keeps guiding you back, "Yes" calms it, and returning to the route clears it.
- [ ] **Shortcut:** leave the route, cut through a side street and rejoin it further along. **JOIN AT x KM** appears, and within about 10 s of running along the route the app locks back in ("Back on route.") without cueing the turns you skipped.
- [ ] **GPS gap:** lock the phone for a minute while walking past a turn, then unlock. The duck jumps ahead, with no burst of old buzzes.
- [ ] **Finish:** "Finished!" appears at the finish, not before about 90 % of the distance.
- [ ] **Readability:** the banner is readable at arm's length in sunlight while jogging. The thick navy route and the dashed gold "covered" line are easy to tell apart.
- [ ] **Wake lock:** the screen stays on for the whole loop (about 40–60 minutes). Note battery use.
- [ ] **Back gesture:** mid-route, the phone's back gesture opens the route menu instead of leaving. END ROUTE needs two taps.
- [ ] **Accidental taps:** with the unlocked phone in a pocket for a minute, nothing ends.
- [ ] **Screen reader (optional):** VoiceOver or TalkBack announces turns, off route and finished, not every metre.

## V2 To-Do List
- [ ] **Lockscreen:** Somehow allow it to be controlled by the lockscreen without needing to put it on App Store / GPlay store. To allow for vibration cues & allow app to be used while locked.
