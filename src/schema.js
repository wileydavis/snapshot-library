// The D1 index. The truth is in R2 (each snapshot exactly as it arrived); this is what the
// library page lists and sorts by. Every statement is safe to run again: the Worker runs them
// when it starts, so there is no database step to remember. Add, never change.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS snapshots (
    uid          TEXT PRIMARY KEY,           -- the snapshot's name everywhere: <library id>-<its id>
    library_id   TEXT NOT NULL,              -- the first sixteen digits of the uid
    local_id     TEXT DEFAULT '',            -- its id in its own library
    name         TEXT NOT NULL DEFAULT '',
    taken_at     INTEGER,                    -- ms
    received_at  INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    app          TEXT DEFAULT '',            -- the build that took it
    has_profile  INTEGER NOT NULL DEFAULT 0,
    energy REAL, weight REAL, bright REAL, density REAL, tone REAL, movement REAL, wet REAL,
    bpm REAL, bars INTEGER, profile_v INTEGER,
    profile      TEXT DEFAULT '',            -- the profile as it arrived (JSON): what a card is drawn from
    lanes        TEXT DEFAULT '',            -- the slots in order, comma separated
    fill         TEXT DEFAULT '',            -- how full each lane's pattern is, 0..1 (JSON array)
    effects      TEXT DEFAULT '',            -- the effects in use, comma separated
    prints       TEXT DEFAULT '',            -- every definition it names, comma separated
    has_clip     INTEGER NOT NULL DEFAULT 0,
    clip_size    INTEGER,
    clip_type    TEXT DEFAULT '',
    json_size    INTEGER,
    tags         TEXT DEFAULT '',            -- written here, not in SF-000: comma separated, lowercase
    notes        TEXT DEFAULT '',
    deleted_at   INTEGER                     -- removed here: its files are gone, and it is not taken in again
  )`,
  `CREATE INDEX IF NOT EXISTS snapshots_taken ON snapshots(taken_at)`,
  `CREATE INDEX IF NOT EXISTS snapshots_library ON snapshots(library_id)`,
  `CREATE TABLE IF NOT EXISTS defs (
    print        TEXT PRIMARY KEY,           -- sixteen hex digits: a hash of the definition
    kind         TEXT DEFAULT '',            -- engine | lane | fx | return | chassis
    name         TEXT DEFAULT '',
    json         TEXT NOT NULL,
    received_at  INTEGER NOT NULL
  )`,
  // A stack: a named pile of chips (snapshots), in an order. One row holds it whole. A chip may be
  // in any number of stacks; a stack only names it (its uid), so a chip removed from the library
  // is simply no longer found when the stack is read.
  `CREATE TABLE IF NOT EXISTS stacks (
    id           TEXT PRIMARY KEY,           -- made here: twelve letters and digits
    name         TEXT NOT NULL DEFAULT '',
    kind         TEXT NOT NULL DEFAULT 'stack',   -- stack | macro (a snapshot knob's chips, in sweep order) | song (parts in a line) | rule (it fills itself)
    rule         TEXT DEFAULT '',            -- a rule stack's rule (JSON): what it holds is worked out on the page
    items        TEXT NOT NULL DEFAULT '[]', -- [ { "u": uid, "bars": 8, "morph": 0 }, ... ] in order (bars and morph: a song's parts)
    depth        REAL,                       -- a macro's DEPTH, 0..1 (null: left to the instrument)
    slot         INTEGER,                    -- a macro's snapshot knob in the instrument, 1..16 (null: none yet)
    load         INTEGER NOT NULL DEFAULT 0, -- 1: in the tray, so SF-000 takes it at LOAD
    pos          REAL NOT NULL DEFAULT 0,    -- where it stands on the bench, low first
    extra        TEXT DEFAULT '',            -- whatever else the page keeps with it (JSON)
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    deleted_at   INTEGER                     -- removed: kept, so it can be put back
  )`,
];

// Columns added to a table that was already there. (SQLite has no "add if missing": the Worker
// asks what the table has and adds what it lacks.) Add, never change.
export const ADDED = [
  // What SF-000 last said the snapshot's name was. A name given on the page stands until SF-000
  // sends a name that is not this one, which means it was renamed there since.
  ['snapshots', 'sent_name', 'TEXT'],
];

