# Snapshot Library

A private catalog of SF-000 snapshots, running on Cloudflare. SF-000 sends each snapshot as it is
taken, with the four bars it was taken over. This keeps them and lays them out as things to
handle: every snapshot is a **chip** with a key for each lane, chips lie in **stacks**, a stack is
built into a **stack knob** in the column, and what you put on the **module** is what the
instrument's sixteen knobs load.

Nothing is asked of you when a snapshot is taken: no name, no tag. What it sounded like comes with
it, worked out by SF-000, and that is what the stacks that fill themselves go by.

## The bench

A bench made as SF-000 is made, in 3D: a powder-coated case in a dark room, with a warm glow
under it. At the back, the **rack**: a faceplate with a cut-out for every stack, the stack
standing in it as a pile of chips, its name on a small display in front. In front, on the case
itself, the **table**: the open stack dealt out face up. Right of the table, the **column**:
the stack knob being built. On the right, the **module**: a model of SF-000's snapshot module
standing on the bench, with sixteen places, four by four, for its sixteen knobs.

**The module is what the instrument carries for a show.** Its first four places take a **macro
knob** (marked white, as the instrument lights one); 5 to 12, 14 and 15 a **stack knob** (teal).
Places 13 and 16 take nothing: on the E16 those two corners are the lane wheel and OPEN on every
page, the snapshot page included, so no knob of the module is on them.
**LOAD**, on SF-000's snapshot module, makes its sixteen knobs what the sixteen places hold: a
knob put on a place takes that knob, one taken off comes off it. Nothing is lost by that: what a
knob held is here already (SF-000 sends its knobs as they are made), in the rack. The library
keeps everything; the module says what goes to the show.

**A stack knob** is a stack of chips in an order. On SF-000 its turn morphs the set through
them, from wherever the set is toward the next one; or, with CUE lit there, goes through them in
the headphones until a press takes the set to the one chosen. It is built in the column:

- **Drag chips into the column.** The first one begins a new stack knob. Put down among the
  others, a chip goes in at that place.
- **Drag a chip within the column** to put it in order. **Drag it out** (onto the table, the
  rack) to take it out of the stack knob; it stays in the library.
- **At the column's head**: its name (type, then Return), how many it holds, and its keys.
  **ADD TO MODULE** puts it on the first free stack place (pressed again, it comes off).
  **NEW** leaves an empty column for another; the one that was there is in the rack.
- A stack dragged onto the column, or a stack knob pressed on the module, comes into the
  column. STACK KNOB (in the foot) makes one of the marked chips; KNOB FROM THIS one from a
  chip's family.
- A stack knob holds 128 chips at most.

**Every chip carries its keys**, along its foot: one for each lane of the rig, with how much of
that lane the snapshot plays standing in it, then **R**, **B** and **K** for the returns, the
drum bus and the key. Lit, that part of the rig comes with the snapshot when the knob reaches
it; put out, it is left as it is. Rest the pointer on a key and the status line names it.

- **Click a key** to put it out or light it. In the column, and on the table when a stack of
  your own is dealt, the stack keeps it. On a chip lying anywhere else (ALL, a mood) it is kept
  by the page until the chip goes into a stack, and goes in with it: listen, put out what you
  do not want, drag it into the column.
- **A chip with keys out is heard that way**: it plays from its stems, each part on its own, the
  ones put out silent, and a key clicked while it plays is heard at once. With every key lit it
  plays its clip. SF-000 sends each snapshot's stems while ONLINE is lit; one whose stems are
  not here plays whole and says so, and its keys still say what it takes.

**A macro knob** (LEARN's kind on the instrument) holds no chips but **moves**, each one of the
rig's own knobs and how far the whole turn takes it. The ones taught on the instrument arrive
by themselves. Here, mark two chips and press KNOB MACRO: it is made of every knob that stands
differently in the second than in the first, each turned by as much as it differs. Open it and
its moves lie on the table as plates (amber: up; teal: down): click one to set its AMOUNT (-100
to 100, a share of that knob's travel), TAKE OUT to take it off. Drag it onto one of the
module's first four places.

On the module and in the rack a knob is drawn as a small plate with its name on a display and
its knobs: TURN, and on a macro knob DEPTH. They turn under the hand (drag up for more): DEPTH
is how far a macro knob goes, and is kept; TURN goes through the chips a stack knob holds and
plays each one it comes to, with its keys.

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
| Click a key on a chip | put that part of the rig out for it, or light it again |
| Drag a chip into the column | into the stack knob being built, where it is put down (an empty column: a new stack knob) |
| Drag a chip within the column; out of it | put it in order; take it out of the stack knob |
| **ADD TO MODULE**, at the column's head | the stack knob goes on the first free stack place of the module. Again takes it off |
| Drag a chip onto a stack place of the module (5 to 12, 14, 15) | a stack knob there (or one more chip in the one there) |
| Drag a stack onto a stack place; a macro knob onto a macro place (1 to 4) | put it on that knob. KNOB on the bar does the same. From place to place moves it; off the module takes it off. A place refuses the other kind, and the status line says which goes where |
| Drag a stack onto the column, or click a stack knob on the module | bring it into the column |
| Drag up or down on a module's knob | turn it: DEPTH sets how far a macro knob goes; TURN plays each chip a stack knob comes to |
| Drag a stack by its pocket under the module's knobs, or TO SF-000 on the bar | SF-000's own LIBRARY screen steps through it after LOAD (it is not a knob). A chip dropped there goes into a stack called TO SF-000, kept for this |
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
- **A stack knob** is a stack of your own that is on the module (its number is on teal), each
  chip with its keys. Any stack of your own can become one: drag it onto the column or a stack
  place. (A stack called a macro, from before the two kinds, is a stack.)
- **A macro knob** holds moves, not chips: KNOB MACRO makes one of two marked chips, and the
  ones taught on the instrument arrive by themselves.
- **A song** is parts in a line: each a chip, how many BARS it lasts and how long the WAY IN takes.
  Marked TO SF-000 it loads as an arrangement.
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
| **KNOB FROM THIS** | three of its family from calmest to fullest: a stack knob (KEEP puts it in the column) |
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
  stems/<uid>              the same bars lane by lane, as SF-000 keeps them (one file: each lane, the two
                           returns and the drum bus, each an Ogg; about a megabyte)
  lossless/<uid>           the same bars without loss, as SF-000 keeps them (one file: the output and each
                           stem, each a 24-bit FLAC; about ten megabytes). Not played here: to be studied
  files/<sha256>           a sound file the rig was given (a sample, an impulse response), under its hash
  sessions/<library>/<at>.json   a library's session without its chips (its knobs, stacks, modules and
                           arrangements, and which chip each of its numbers is), each time it changed
D1 database snapshot-library
  snapshots                an index for the page: name, time, the profile's measures, lanes, effects, tags, notes
  defs                     every definition a snapshot names (what each stored value was a position of)
  stacks                   one row a stack: its name, its kind, its chips in order (by uid, each with the
                           parts of the rig it does not take), its rule if it fills itself, and for SF-000:
                           its place on the module, a macro knob's moves and depth, whether it is in the
                           list for the instrument's library screen
  files                    which sound files are here: hash, the name each first came with, size
  actions                  the instrument's log: a row a line, as it arrived (what was done with which
                           chip, and when), under the line's own name so that none is kept twice
  sessions                 which sessions are here: library, time, hash, size, the build that wrote it
  analysis                 what the analysis found, a row a result (the result itself in R2: analysis/<at>.json)
```

**To be studied from.** The lossless sound, the sound files, the log and the sessions are what
SF-000 sends so that the library can be studied away from the instrument: by a program of its
own, on another machine, which fetches from here and puts back what it finds. Nothing on this
page uses them yet. They are only ever added to: a line of the log, a session and a sound file,
once here, are never changed (removing a snapshot removes its lossless sound with its clip).

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
| `PUT /api/stems/<uid>` | The snapshot's stems, SF-000's file as it is (`SF0STEMS1`, a line of JSON, the stems). Refused if it is not one, or is cut short. |
| `GET /api/stems/<uid>` | The file. With `?key=bass`, that one stem (an Ogg file). |
| `PUT /api/lossless/<uid>` | The snapshot's sound without loss, SF-000's file as it is (`SF0LOSSLESS1`, a line of JSON, then each part a FLAC file). The snapshot has to be here first. Refused if it is not one, or is cut short. 64 MB at most. |
| `GET /api/lossless/<uid>` | The file. With `?key=mix` (or a stem's key), that one part, a FLAC file; `x-gain` is what it was multiplied by before it was written (divide by it). |
| `POST /api/files/have` | `{ "hashes": [...] }` → `{ "have": { "<sha256>": true } }`. |
| `PUT /api/files/<sha256>?name=` | A sound file. Kept only if it is the file that hash says (the store works the hash out as it goes in). Sent again: kept once. 96 MB at most. |
| `GET /api/files/<sha256>` | The file; `x-name` is the name it first came with. |
| `POST /api/actions` | `{ "library": "<sixteen hex>", "lines": [{ "k", "t", "a", "u"?, ... }] }`, a thousand lines at most. Each line is kept as it arrived, once (by `k`). Answers `{ ok, taken, refused }`. |
| `GET /api/actions?library=&after=<ms>&limit=` | That library's lines from after that time, oldest first, and `total`. |
| `POST /api/sessions` | `{ "library", "at": ms, "app", "session": {...} }`. Kept if it differs from the last one that library sent (`same: true` if not). |
| `GET /api/sessions?library=` | What is here for it, newest first: `{ at, hash, size, app }`. `GET /api/sessions/<library>/<at>`: that session as it was sent. |
| `POST /api/analysis` | What the analysis found, from SF-000 Analysis on the machine it runs on: `{ "at": ms, "app", "counts", "snapshots": { "<uid>": { "energy", "alike", "up", "down", "follows", "grew_from", "measured" } } }`. Kept whole if it differs from the newest one here (`same: true` if not); one older than the newest is refused (409). 24 MB at most. |
| `GET /api/analysis` | What is here, newest first: `{ at, hash, size, app, snapshots }`. `GET /api/analysis/latest`: the newest as it was sent; `GET /api/analysis/<at>`: an older one. |
| `POST /api/have` | `{ "uids": [...] }` → `{ "have": { "<uid>": { "clip": true, "stems": true, "lossless": true } } }`. What is already here, for catching up after time offline. One removed here answers `{ "gone": true }`: known, not wanted again. |
| `GET /api/snapshots` | The list the page draws from, newest first. Each says which stems it has (`stems`: their keys) and which parts of its sound without loss (`lossless`). |
| `GET /api/snapshots/<uid>` | One, with the snapshot whole under `snapshot`. |
| `PATCH /api/snapshots/<uid>` | `{ "name": "...", "tags": [...], "notes": "..." }`, any of them. A name given here stands until SF-000 renames the snapshot there: the last to rename it has it. |
| `POST /api/tags` | `{ "uids": [...], "add": [...], "remove": [...] }`: tags on many at once. |
| `DELETE /api/snapshots/<uid>` | Removes it and its clip, and leaves a mark so it is not taken in again. `?forget=1` drops the mark too. |
| `GET /api/clips/<uid>` | The clip, with byte ranges. |
| `POST /api/export` | `{ "uids": [...] }` → a library file: `{ "sf000lib": 1, "snapshots": [...], "defs": {...} }`, tags and notes under each snapshot's `ext.web`. |
| `GET /api/defs?prints=a,b` | Definitions by print. |
| `GET /api/stacks` | Every stack, in the order they stand. `?removed=1`: the removed ones. |
| `POST /api/stacks` | `{ "id"?, "name", "kind": "stack" \| "learn" \| "song" \| "rule" (\| "macro", from before the two kinds: a stack), "items": [uid or { "u": uid, "off"?: [parts] } or, in a song, { "u": uid, "bars", "morph" }], "rule"?, "depth"?, "slot"?, "load"?, "extra"? }`. `off`: the parts of the rig that chip does not take (a lane's key, `returns`, `bus`, `master`). A `learn` is a macro knob: no items, its moves in `extra.links` as `[ { c: control id, d: share of its travel } ]`. With an `id` (8 to 24 letters and digits), making it twice is one stack. |
| `GET /api/stacks/<id>`, `PATCH`, `DELETE` | One stack; any of those fields changed (`items` is the whole list, in order); removed (kept, and put back with `PATCH { "restore": true }`). `slot` is its place on the module, 1 to 16: 1 to 4 take a macro knob; 5 to 12, 14 and 15 a stack of chips; 13 and 16 nothing. The other kind is refused (400), and a song or a stack that fills itself goes on none. A place holds one thing: giving a `slot` takes it from the one that had it. |
| `GET /api/load` | **What SF-000 takes at LOAD**: `{ "load": 2, "macro_places": 4, "stack_places": [5, 6, 7, 8, 9, 10, 11, 12, 14, 15], "knobs": [ { id, slot, kind, name, depth, uids, off?, links? } ], "stacks": [ { id, name, kind, uids, parts? } ], "chips": { "<uid>": { name, clip, tags } } }`. `knobs` is the module: a macro knob (`kind` `learn`, its `links`) on 1 to 4, a stack knob (`uids` in order; `off`, one list for each, where any chip leaves a part out) on a stack place. `stacks` are those marked for the instrument's library screen. |
| `GET /api/stats` | Counts. `archive`: how many snapshots have lossless sound, and how many sound files, lines of the log and sessions are here. |

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
public/js/bench.js     the bench drawn and handled: the rack, the table, the column, the module and its knobs, a chip's keys, picking up and putting down
public/js/look.js      the instrument's look: its finishes, light, room, glow and shapes (plates, keys' and knobs' parts)
public/wear.png        the instrument's scratch sheet (SF-000's assets/wear.png, made by its tools/wear.py)
public/js/stacks.js    the stacks that fill themselves: like, family, song, knob, moods, sittings, auto sort
public/js/card.js      a snapshot's card, drawn as SF-000 draws it, light or dark, with its keys
public/js/stems.js     a snapshot's stems read and played, each part on a gain of its own
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

- SF-000 does not read EXPORT's library file. Its **LOAD** takes what is on the module instead (its
  sixteen knobs, the chips it lacks, the stacks marked for its library screen, a song as the
  arrangement if it has none); the file is for other tools.
- **Shows by name.** The module is one show. Keeping several and swapping one for another is not
  built: for now a stack knob taken off the module stays in the rack, to be put back.
- A chip's keys are not kept across a reload until the chip is in a stack of your own.
- Stems for snapshots taken before SF-000 kept them (its fortieth build): those play whole.
- **Putting chips away from the instrument.** The samples a snapshot names are kept here now
  (by their SHA-256), but SF-000 does not yet fetch one back, so it cannot safely let go of a chip.
- **This page showing what the analysis found.** It is kept here (`/api/analysis/latest`); for now
  it is listened to on the page SF-000 Analysis writes on its own machine, and SF-000 does not read
  it yet.
- A song's parts are set one at a time on the chip's strip: no row of bars to drag.
- The moods' places are fixed in `stacks.js`: no page to move them on. MOOD FROM THEM is the way
  to make your own.
- Deeper listening: likeness learned from the clips, comparison with reference tracks, a layout
  of the table by likeness.
- The bench is made for a mouse and a wide window. On a phone, `flat.html`.
