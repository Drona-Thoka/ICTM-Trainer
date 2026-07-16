-- ============================================================
--  Math Competition Problem Bank
--  SQLite Schema
-- ============================================================


-- ------------------------------------------------------------
--  1. competitions
--     One row per competition type. Seed this table manually.
-- ------------------------------------------------------------
CREATE TABLE competitions (
    competition_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,          -- e.g. "ICTM State"
    short_name       TEXT NOT NULL UNIQUE,   -- e.g. "ICTM", "AMC10", "AIME", "NSML", "ARML"
    answer_format    TEXT NOT NULL           -- "numeric" or "multiple_choice"
);


-- ------------------------------------------------------------
--  2. topics
--     Master list of topic tags. Shared across all competitions.
--     Add rows freely as the tag list grows.
-- ------------------------------------------------------------
CREATE TABLE topics (
    topic_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE   -- e.g. "Algebra", "Geometry", "Number Theory",
                                      --      "Combinatorics", "Precalculus", "Advanced Math"
);


-- ------------------------------------------------------------
--  3. problems
--     Core table. One row per individual problem.
-- ------------------------------------------------------------
CREATE TABLE problems (
    problem_id          INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Content
    problem_text        TEXT NOT NULL,     -- LaTeX string
    solution_text       TEXT,              -- LaTeX string, nullable (not always known)
    answer              TEXT,              -- nullable — may be unknown at import time
    choices_json        TEXT,              -- nullable — only for AMC multiple choice
                                           -- format: {"A":"...","B":"...","C":"...","D":"...","E":"..."}
    image_path          TEXT,              -- nullable — relative path to a diagram image if needed

    -- Competition identity
    competition_id      INTEGER NOT NULL REFERENCES competitions(competition_id),
    comp_event          TEXT,              -- nullable — ICTM only
                                           -- e.g. "Algebra 1", "Geometry", "Fr/So 2-person"
    comp_year           INTEGER,           -- nullable — may be unknown from a bad scan
    comp_problem_number INTEGER,           -- nullable — position within its original test

    -- Difficulty (stored as native label per competition, not a global scale)
    -- ICTM:  "Easy", "Medium", "Hard"
    -- NSML:  "Q1", "Q2", "Q3", "Q4", "Q5"
    -- AMC:   "Q1-Q10", "Q11-Q15", "Q16-Q20", "Q21-Q25"
    -- AIME:  "Q1-Q5", "Q6-Q10", "Q11-Q15"
    -- ARML:  "Q1-Q7", "Q8-Q14", "Q15-Q21", "Q22-Q24"
    comp_difficulty     TEXT,              -- nullable — may be unknown at import

    -- Pipeline status
    review_status       TEXT NOT NULL DEFAULT 'pending'
                        CHECK(review_status IN ('pending', 'approved', 'rejected')),
    review_notes        TEXT,              -- nullable — human reviewer comments

    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ------------------------------------------------------------
--  4. problem_topics
--     Many-to-many: one problem can have multiple topic tags.
--     e.g. a problem tagged both "Geometry" and "Combinatorics"
--     gets two rows here.
-- ------------------------------------------------------------
CREATE TABLE problem_topics (
    problem_id   INTEGER NOT NULL REFERENCES problems(problem_id),
    topic_id     INTEGER NOT NULL REFERENCES topics(topic_id),
    PRIMARY KEY (problem_id, topic_id)
);


-- ------------------------------------------------------------
--  5. mocks
--     A full contest — either a real past test or a custom set.
--     NSML mocks store one topic tag for the whole test.
-- ------------------------------------------------------------
CREATE TABLE mocks (
    mock_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id      INTEGER NOT NULL REFERENCES competitions(competition_id),
    title               TEXT NOT NULL,       -- e.g. "ICTM 2023 Algebra 1"
    year                INTEGER,             -- nullable
    nsml_topic          TEXT,                -- nullable — NSML only, topic for the whole test
    time_limit_seconds  INTEGER,             -- nullable — null means untimed
    review_status       TEXT NOT NULL DEFAULT 'pending'
                        CHECK(review_status IN ('pending', 'approved', 'rejected')),
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ------------------------------------------------------------
--  6. mock_problems
--     Links problems into a mock, preserving order.
-- ------------------------------------------------------------
CREATE TABLE mock_problems (
    mock_id     INTEGER NOT NULL REFERENCES mocks(mock_id),
    problem_id  INTEGER NOT NULL REFERENCES problems(problem_id),
    position    INTEGER NOT NULL,   -- 1-indexed question number within the mock
    PRIMARY KEY (mock_id, problem_id)
);


-- ============================================================
--  Seed data — competitions
--  Run once when setting up a fresh database.
-- ============================================================
INSERT INTO competitions (name, short_name, answer_format) VALUES
    ('ICTM State',    'ICTM',  'numeric'),
    ('NSML',          'NSML',  'numeric'),
    ('AMC 10',        'AMC10', 'multiple_choice'),
    ('AMC 12',        'AMC12', 'multiple_choice'),
    ('AIME',          'AIME',  'numeric'),
    ('ARML Tryouts',  'ARML',  'numeric');


-- ============================================================
--  Seed data — topics
--  Starting list. Add more rows freely as needed.
-- ============================================================
INSERT INTO topics (name) VALUES
    ('Algebra'),
    ('Geometry'),
    ('Number Theory'),
    ('Combinatorics'),
    ('Precalculus'),
    ('Advanced Math');
