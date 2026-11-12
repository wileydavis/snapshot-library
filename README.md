# Snapshot Library

A private catalog of SF-000 snapshots, running on Cloudflare. SF-000 sends each snapshot as it is
taken, with the four bars it was taken over. This keeps them, shows them as the cards the
instrument draws, and lets you hear, order, narrow and export them.

- **Click a card** to hear its clip (it loops); click it again, or press space, to stop. Arrows move.
- **ORDER**: newest, calm to peak, dark to bright, or nearest in sound to the selected one.
- **THE MAP**: energy up, brightness across, the same sixteen squares as the E16's library scene.
  A square narrows the list to what is in it.
- **FIND** looks in names, tags, notes and effects. Tags and notes are written here and kept
  beside the snapshot, never in it.
- **MARK** (shift-click, or M) then **EXPORT** downloads a library file: those snapshots, and every
  definition they name. With nothing marked, EXPORT takes everything shown.
- Each snapshot has its own address (the page's `#...`), so one can be bookmarked or sent.

Nothing is asked of you when a snapshot is taken: no name, no tag. What it sounded like comes with
it, worked out by SF-000.

## What gets stored

```
R2 bucket snapshot-library
  snapshots/<uid>.json     each snapshot exactly as SF-000 wrote it, whole
  clips/<uid>              its four bars (Ogg Vorbis, a few hundred kilobytes)
D1 database snapshot-library
  snapshots                an index for the page: name, time, the profile's measures, lanes, effects
  defs                     every definition a snapshot names (what each stored value was a position of)
```

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
3. The two strings go into SF-000's ONLINE setup, on your Mac only. They never go in a repo.

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
| `PATCH /api/snapshots/<uid>` | `{ "tags": [...], "notes": "..." }`. |
| `DELETE /api/snapshots/<uid>` | Removes it and its clip, and leaves a mark so it is not taken in again. `?forget=1` drops the mark too. |
| `GET /api/clips/<uid>` | The clip, with byte ranges. |
| `POST /api/export` | `{ "uids": [...] }` → a library file: `{ "sf000lib": 1, "snapshots": [...], "defs": {...} }`, tags and notes under each snapshot's `ext.web`. |
| `GET /api/defs?prints=a,b` | Definitions by print. |
| `GET /api/stats` | Counts. |

## Local development

```bash
npm install
npm run dev              # http://localhost:8787, no login, local storage
npm test                 # the index's summary of a snapshot, the page's ordering, the Access gate
npm run test:live        # the whole path against the running dev server, with real SF-000 snapshots
SEED=1 npm run test:live # the same, leaving sixty made-up snapshots to look at
```

## Files

```
src/worker.js          the API: taking snapshots and clips in, the list, export, Access verification
src/schema.js          the D1 tables
public/index.html      the page
public/js/main.js      what the page does
public/js/card.js      a snapshot's card, drawn as SF-000 draws it
public/js/profile.js   the profile's measures and the likeness sum, as SF-000 has them
public/js/narrow.js    which snapshots are shown, and in what order
test/                  the tests, and snapshots as SF-000 0.1.0 writes them
```

## Not built yet

- SF-000's side: the ONLINE key that sends each snapshot as it is taken, and loading a library file.
- Buckets and snapshot knobs built here and sent back to the instrument.
- Deeper listening: likeness learned from the clips, comparison with reference tracks, a map laid
  out by likeness.
- The phone layout is plain: it works, it has not been designed.
