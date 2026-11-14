# Snapshot Library

A private catalog of SF-000 snapshots, running on Cloudflare. SF-000 sends each snapshot as it is
taken, with the four bars it was taken over. This keeps them and lays them out as things to
handle: every snapshot is a **chip**, chips lie in **stacks**, and the stacks you put on the chassis
are what the instrument loads.

Nothing is asked of you when a snapshot is taken: no name, no tag. What it sounded like comes with
it, worked out by SF-000, and that is what the stacks that fill themselves go by.

## The bench

A bench made as SF-000 is made, in 3D: a powder-coated case in a dark room, with a warm glow
under it. At the back, the **rack**: a faceplate with a cut-out for every stack, the stack
standing in it as a pile of chips, its name on a small display in front. In front, on the case
itself, the **table**: the open stack dealt out face up. On the right, the **chassis**: a model
of SF-000 standing on the bench, with sixteen pockets, four by four, for its sixteen snapshot
knobs, and under them the stacks LOAD brings.

A knob is a **module**: a small plate with its name on a display and the instrument's two knobs,
TURN and DEPTH. A macro is always one (it rides on the pile of chips it sweeps through); a stack
becomes one when it goes on a knob (a cue stack: it steps). Dropped in a pocket of the chassis,
a module is on that knob at the next LOAD, and shows its knob's number: on teal if it sweeps, on
amber if it steps. Its knobs turn under the hand (drag up for more): DEPTH is how far a macro
goes, and is kept; TURN goes through the chips the knob holds and plays each one it comes to,
as a turn of the instrument's knob would bring it.

A chip is one of the instrument's plates: the snapshot's card printed on black anodizing that
has been used, every chip with scratches of its own. Its edge is its colour (deep red for a dark
sound, through amber and yellow, to white), so the side of a pile shows what is in it.

The finishes, the light, the room and the glow round what is lit are the instrument's own
(`public/js/look.js` is its 3D stage's drawing, carried over; `public/wear.png` is its scratch
sheet). If a browser draws the bench wrong or slowly, `?plain` after the address draws it the
straight way, without the glow.

| DO THIS | TO |
| --- | --- |
| Click a stack | deal it out on the table |
| Click a chip | choose it and hear its four bars, looped. Again, or space, stops. Arrows move along the chips |
| Shift-click a chip, or **M** | mark it. What is done to a marked chip is done to all the marked |
| Drag a chip onto a stack | put it in that stack (it stays where it was too: a chip can be in any number of stacks) |
| Drag a chip onto **+ NEW STACK** | a new stack of it |
| Drag a chip along the table | put the open stack in order (a stack of your own, with ORDER on AS IT IS STACKED) |
| **Backspace**, or TAKE OUT | take the chosen chip out of the open stack. It stays in the library |
| Drag a stack by its pocket onto the chassis, under its knobs | SF-000 takes it at LOAD (the key beside SET UP on its library screen). Dragged out again, it is gone from the instrument at the next LOAD; its chips stay there. TO SF-000 on the bar does the same |
| Drag a chip onto a pocket of the chassis | a **cue stack** on that knob (or one more chip in what the knob holds). In SF-000 the knob steps through the stack: a turn cues a chip, a press morphs to it |
| Drag a stack or a macro onto a pocket of the chassis | put it on that knob: a macro sweeps, a stack steps. KNOB on the bar does the same. From pocket to pocket moves it; out of the chassis takes it off |
| Drag up or down on a module's knob | turn it: DEPTH sets how far a macro goes; TURN plays each chip it comes to |
| The wheel | over the table, moves through the open stack; over the rack, turns its rows |
| **/** | FIND, in what is dealt: names, tags, notes, effects |
| **D** | the dark library, as the dark instrument. It starts as your computer is set, and stays as you leave it |
| **Esc** | back to ALL |

The bar at the top is the open stack: its name (type a new one), how many it holds, and its keys.
The strip under the table is the chosen chip: its name, tags and notes (type, then Return), its
seven measures, and what can be made from it. The foot is for the marked.

### Stacks

- **ALL**, **UNSORTED** (in no stack of your making yet) and **RECENT** are always there.
- **Your stacks** come next: made with + NEW STACK, STACK THEM (the marked), or KEEP on anything
  that is out. REMOVE STACK, pressed twice, takes a stack away and leaves its chips.
- **A macro** is made on purpose: the chips a snapshot knob sweeps through, in the order they
  lie, with a DEPTH. MACRO makes one of the marked chips, KNOB FROM THIS one from a chip's
  family. Give it a knob on the bar, or drag it to a bay. Its bay's number is on teal.
- **A cue stack** is any stack on a knob (its bay's number is on amber): a curated list the knob
  steps through. It is among the instrument's stacks as well.
- **A song** is parts in a line: each a chip, how many BARS it lasts and how long the WAY IN takes.
  On the chassis it loads as an arrangement.
- **Moods** (DEEP, DUB, DRIVING, HYPNOTIC, PEAK, SPARSE, DARK, BRIGHT, HEAVY, RESTLESS, WARM-UP)
  hold whatever fits them. Each is a place on the seven measures and how much each measure
  matters to it.
- **Sittings**: one stack for each sitting at the instrument (snapshots less than 45 minutes
  apart), the newest six.

### Stacks that fill themselves

| | |
| --- | --- |
| **LIKE THIS** | the 24 nearest the chosen chip, itself first, by the sum SF-000 and the E16 use |
| **SONG FROM THIS** | the chip's family (the same colour whatever the energy, near the same tempo; taken in the same sitting counts double) spread over the shape of a set piece: in, build, drive, peak, break, build, peak, out. No chip twice |
| **KNOB FROM THIS** | three of its family from calmest to fullest: a macro |
| **MOOD FROM THEM** | what the marked chips share: their middle on each measure, weighted by how far they agree on it. A stack of everything that fits |
| **AUTO SORT** | the whole library dealt into piles of like sounds (k-means from a fixed start, so the same library is dealt the same way), the most typical chip on top. Press it again to put them away |

What one of these gives is out on the table and not kept. **KEEP** makes it a stack that goes on
filling itself as snapshots arrive; **FREEZE** makes it an ordinary stack of what it holds now.
The arithmetic is plain and the same every time (`public/js/stacks.js`); nothing is learned or
trained.

`flat.html` is the page as it was before the bench: cards in a grid, the map, export. It is what
to use where a browser will not start 3D.

## What gets stored

```
R2 bucket snapshot-library
  snapshots/<uid>.json     each snapshot exactly as SF-000 wrote it, whole
  clips/<uid>              its four bars (Ogg Vorbis, a few hundred kilobytes)
D1 database snapshot-library
  snapshots                an index for the page: name, time, the profile's measures, lanes, effects, tags, notes
  defs                     every definition a snapshot names (what each stored value was a position of)
  stacks                   one row a stack: its name, its kind, its chips in order (by uid), its rule if it
                           fills itself, and for the chassis: whether it loads, a macro's knob and depth
```

A stack only names its chips. A snapshot is never copied into one and never changed by one.

The contract is SF-000's `FORMAT.md`: additions only, and whatever a snapshot holds that this code
does not know stays in it. The index can always be rebuilt from the bucket.

## Setup (one time)

### 1. Deploy

Cloudflare dashboard → **Workers & Pages** → *Create* → *Import a repository* → this repo. It
deploys on every push to `main`. The first deploy makes the bucket and the database (both named
`snapshot-library`) and puts the site at **snapshots.drosaka.com**, set in `routes` in
`wrangler.jsonc`.

If that first deploy stops because the bucket or database is missing, make them once and deploy
again (`npx wrangler r2 bucket create snapshot-library`, `npx wrangler d1 create snapshot-library`,
or in the dashboard under R2 and D1). There is no schema step: the Worker makes its tables itself.

Until step 2 is done every API call is refused. That is deliberate.

### 2. Lock it to you with Cloudflare Access

1. **Zero Trust** → **Access controls** → **Applications** → add an application → *Self-hosted*.
2. Domain: `snapshots.drosaka.com`. Session duration: something long, like 1 month.
3. Policy: *Allow*, **Emails** = your address.
4. Save, select **Configure** on the application, and copy its **Application Audience (AUD) Tag**
   (under *Additional settings*; on some dashboards the first tab).
5. Put it in `wrangler.jsonc` → `vars` → `ACCESS_AUD`, and push. (`ACCESS_TEAM_DOMAIN` is already
   the team the sound library uses.)

Access stops strangers at Cloudflare's edge. The Worker also checks the Access token's signature
on every API call, and the `workers.dev` address is off, so nothing reaches the library around it.

### 3. Let SF-000 in

SF-000 is not a browser, so it signs in with a service token.

1. **Zero Trust** → **Access controls** → **Service credentials** → **Service Tokens** →
   *Create Service Token*. Name it `SF-000` and give it a long duration: when it runs out,
   SF-000 stops getting through until the token is refreshed.
   Copy the **Client ID** and **Client Secret** now: the secret is shown once.
2. Back in the application from step 2, add a second policy: action **Service Auth** (not
   *Allow*, or Access asks SF-000 to log in), include **Service Token** = `SF-000`.
3. In SF-000: the library screen → **SET UP**. Enter `https://snapshots.drosaka.com` and the two
   strings, press CHECK, then KEEP, and light **ONLINE**. The strings stay on your Mac; they
   never go in a repo.

SF-000 then sends `CF-Access-Client-Id` and `CF-Access-Client-Secret` with each request.

## The API

Everything is under `/api/` and needs Access. A `uid` is sixteen hex digits, `-`, and the
snapshot's own id.

| | |
| --- | --- |
| `POST /api/snapshots` | `{ "snapshot": {...}, "defs": { "<print>": {...} } }`. Keeps it. Answers `{ ok, uid, clip, missingDefs }`: whether its clip is here, and which definitions it names that are not. Sending one again is harmless. |
| `PUT /api/clips/<uid>` | The clip's bytes. The snapshot has to be here first. |
| `POST /api/have` | `{ "uids": [...] }` → `{ "have": { "<uid>": { "clip": true } } }`. What is already here, for catching up after time offline. One removed here answers `{ "gone": true }`: known, not wanted again. |
| `GET /api/snapshots` | The list the page draws from, newest first. |
| `GET /api/snapshots/<uid>` | One, with the snapshot whole under `snapshot`. |
| `PATCH /api/snapshots/<uid>` | `{ "name": "...", "tags": [...], "notes": "..." }`, any of them. A name given here stands until SF-000 renames the snapshot there: the last to rename it has it. |
| `POST /api/tags` | `{ "uids": [...], "add": [...], "remove": [...] }`: tags on many at once. |
| `DELETE /api/snapshots/<uid>` | Removes it and its clip, and leaves a mark so it is not taken in again. `?forget=1` drops the mark too. |
| `GET /api/clips/<uid>` | The clip, with byte ranges. |
| `POST /api/export` | `{ "uids": [...] }` → a library file: `{ "sf000lib": 1, "snapshots": [...], "defs": {...} }`, tags and notes under each snapshot's `ext.web`. |
| `GET /api/defs?prints=a,b` | Definitions by print. |
| `GET /api/stacks` | Every stack, in the order they stand. `?removed=1`: the removed ones. |
| `POST /api/stacks` | `{ "id"?, "name", "kind": "stack" \| "macro" \| "song" \| "rule", "items": [uid or { "u": uid, "bars", "morph" }], "rule"?, "depth"?, "slot"?, "load"? }`. With an `id` (8 to 24 letters and digits), making it twice is one stack. |
| `GET /api/stacks/<id>`, `PATCH`, `DELETE` | One stack; any of those fields changed (`items` is the whole list, in order); removed (kept, and put back with `PATCH { "restore": true }`). A knob holds one macro: giving a macro a `slot` takes it from the one that had it. |
| `GET /api/load` | **What SF-000 takes at LOAD**: `{ "stacks": [ { id, name, kind, uids, parts? } ], "knobs": [ { id, slot, kind, name, depth, uids } ], "chips": { "<uid>": { name, clip, tags } } }`. The stacks in the tray and what is on each knob (`kind` "macro": the knob sweeps; "stack": it steps, a cue stack, and is among the stacks too), each with the chips it holds now (a stack that fills itself: what it held when the page last looked). |
| `GET /api/stats` | Counts. |

## Local development

```bash
npm install
npm run dev              # http://localhost:8787, no login, local storage
npm test                 # the index's summary of a snapshot, the page's ordering, the Access gate
npm run test:live        # the whole path against the running dev server, with real SF-000 snapshots
SEED=1 npm run test:live # the same, leaving sixty made-up snapshots to look at
node test/seed.mjs       # a made-up library of 240 (or `node test/seed.mjs 3000`): sittings, grooves, families
node test/seed.mjs --clear
npm run test:bench       # the bench itself, pressed and dragged in a real browser with no window (needs Chrome;
                         # CHROME=/path/to/it if it is not /usr/bin/google-chrome). SHOTS=dir keeps pictures.

# SF-000's own sender against this server (from the SF-000 repo, with `npm run dev` running here):
#   build/SF000_artefacts/Release/SF-000 --onlinetest http://127.0.0.1:8787
```

## Files

```
src/worker.js          the API: snapshots and clips in, the list, stacks, what SF-000 loads, export, Access
src/schema.js          the D1 tables, and the columns added since (the Worker adds what a table lacks)
public/index.html      the bench
public/js/main.js      what there is and what each press and drop means: chips, stacks, the open stack
public/js/bench.js     the bench drawn and handled: the rack, the table, the chassis and its knob modules, picking up and putting down
public/js/look.js      the instrument's look: its finishes, light, room, glow and shapes (plates, keys' and knobs' parts)
public/wear.png        the instrument's scratch sheet (SF-000's assets/wear.png, made by its tools/wear.py)
public/js/stacks.js    the stacks that fill themselves: like, family, song, knob, moods, sittings, auto sort
public/js/card.js      a snapshot's card, drawn as SF-000 draws it, light or dark
public/js/profile.js   the profile's measures and the likeness sum, as SF-000 has them
public/js/narrow.js    FIND and ORDER
public/flat.html, public/js/flat.js      the page as it was before the bench
public/vendor/three.min.js               three.js 0.187 (MIT, its licence beside it), bundled once with
                                         esbuild from the npm package's build/three.module.js; no build step
test/                  the tests, snapshots as SF-000 0.1.0 writes them, and the made-up library
```

The Worker makes and widens its own tables when it starts: tables with `CREATE TABLE IF NOT
EXISTS`, and a column a table from before lacks with `ALTER TABLE ... ADD COLUMN`. Nothing is ever
changed or dropped, so a deploy cannot take a snapshot, a tag or a stack with it.

## Not built yet

- SF-000 does not read EXPORT's library file. Its **LOAD** takes what is on the chassis instead (the stacks,
  the chips it lacks, macros onto knobs that hold nothing, a song as the arrangement if it has
  none); the file is for other tools.
- **Putting chips away from the instrument.** A snapshot can name a sample that is only on the
  Mac. Samples have to be kept here (by their SHA-256, which the session already has) before the
  instrument can safely let go of a chip.
- A song's parts are set one at a time on the chip's strip: no row of bars to drag.
- The moods' places are fixed in `stacks.js`: no page to move them on. MOOD FROM THEM is the way
  to make your own.
- Deeper listening: likeness learned from the clips, comparison with reference tracks, a layout
  of the table by likeness.
- The bench is made for a mouse and a wide window. On a phone, `flat.html`.
