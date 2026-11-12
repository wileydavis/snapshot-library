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
];
