import os
import sqlite3
from flask import Flask, g, abort

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), 'trainer.db')

COMPETITIONS = [
    ('amc', None, 'easy', '<h2>AMC Easy</h2><p>Sample AMC easy problems and practice hints.</p>'),
    ('amc', None, 'medium', '<h2>AMC Medium</h2><p>Sample AMC medium problems and practice hints.</p>'),
    ('amc', None, 'hard', '<h2>AMC Hard</h2><p>Sample AMC hard problems and practice hints.</p>'),
    ('aime', None, 'easy', '<h2>AIME Easy</h2><p>Sample AIME easy problems and practice hints.</p>'),
    ('aime', None, 'medium', '<h2>AIME Medium</h2><p>Sample AIME medium problems and practice hints.</p>'),
    ('aime', None, 'hard', '<h2>AIME Hard</h2><p>Sample AIME hard problems and practice hints.</p>'),
    ('arml', None, 'easy', '<h2>ARML Easy</h2><p>Sample ARML easy problems and practice hints.</p>'),
    ('arml', None, 'medium', '<h2>ARML Medium</h2><p>Sample ARML medium problems and practice hints.</p>'),
    ('arml', None, 'hard', '<h2>ARML Hard</h2><p>Sample ARML hard problems and practice hints.</p>'),
    ('nsml', 'Event A', 'Beginner', '<h2>NSML Event A Beginner</h2><p>Sample problems for Event A at Beginner difficulty.</p>'),
    ('nsml', 'Event A', 'Easy', '<h2>NSML Event A Easy</h2><p>Sample problems for Event A at Easy difficulty.</p>'),
    ('nsml', 'Event B', 'Medium', '<h2>NSML Event B Medium</h2><p>Sample problems for Event B at Medium difficulty.</p>'),
    ('nsml', 'Event C', 'Hard', '<h2>NSML Event C Hard</h2><p>Sample problems for Event C at Hard difficulty.</p>'),
    ('ictm', 'Event 1', 'Easy', '<h2>ICTM Event 1 Easy</h2><p>Sample problems for Event 1 at Easy difficulty.</p>'),
    ('ictm', 'Event 2', 'Medium', '<h2>ICTM Event 2 Medium</h2><p>Sample problems for Event 2 at Medium difficulty.</p>'),
    ('ictm', 'Event 3', 'Hard', '<h2>ICTM Event 3 Hard</h2><p>Sample problems for Event 3 at Hard difficulty.</p>'),
]


def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        g._database = db
    return db


def close_db(error=None):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()


@app.teardown_appcontext
def teardown_db(exception):
    close_db(exception)


def init_db():
    if os.path.exists(DB_PATH):
        return

    db = sqlite3.connect(DB_PATH)
    cursor = db.cursor()
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comp TEXT NOT NULL,
            event TEXT,
            diff TEXT NOT NULL,
            html TEXT NOT NULL
        )
        '''
    )
    cursor.executemany(
        'INSERT INTO content (comp, event, diff, html) VALUES (?, ?, ?, ?)',
        COMPETITIONS,
    )
    db.commit()
    db.close()


def query_content(comp: str, diff: str, event: str | None = None) -> str:
    db = get_db()
    if event is None:
        row = db.execute(
            'SELECT html FROM content WHERE comp = ? AND diff = ? AND event IS NULL',
            (comp, diff),
        ).fetchone()
    else:
        row = db.execute(
            'SELECT html FROM content WHERE comp = ? AND event = ? AND diff = ?',
            (comp, event, diff),
        ).fetchone()

    if row is None:
        abort(404, description='No content found for the requested competition and difficulty.')
    return row['html']


@app.route('/')
def hello_world():
    return '<p>Hello, World!</p>'


@app.route('/get_amc/<diff>')
def get_amc(diff: str):
    return query_content('amc', diff)


@app.route('/get_aime/<diff>')
def get_aime(diff: str):
    return query_content('aime', diff)


@app.route('/get_arml/<diff>')
def get_arml(diff: str):
    return query_content('arml', diff)


@app.route('/get_nsml/<event>/<diff>')
def get_nsml(event: str, diff: str):
    return query_content('nsml', diff, event)


@app.route('/get_ictm/<event>/<diff>')
def get_ictm(event: str, diff: str):
    return query_content('ictm', diff, event)


@app.route('/amc_solutions/<int:problem>')
def amc_solutions(problem: int):
    return f'<p>Solutions for AMC problem {problem} are not implemented yet.</p>'


@app.route('/aime_solutions/<int:problem>')
def aime_solutions(problem: int):
    return f'<p>Solutions for AIME problem {problem} are not implemented yet.</p>'


@app.route('/nsml_solutions/<int:problem>')
def nsml_solutions(problem: int):
    return f'<p>Solutions for NSML problem {problem} are not implemented yet.</p>'


@app.route('/ictm_solutions/<int:problem>')
def ictm_solutions(problem: int):
    return f'<p>Solutions for ICTM problem {problem} are not implemented yet.</p>'


@app.route('/arml_solutions/<int:problem>')
def arml_solutions(problem: int):
    return f'<p>Solutions for ARML problem {problem} are not implemented yet.</p>'


if __name__ == '__main__':
    init_db()
    app.run(debug=True)
