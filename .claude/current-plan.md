# Feature: Quick Wins Bundle — Blast Radius Configurable + SQLite Migration + Minor Fixes

## Impact Analysis
- Files affected:
  - `server/memory.py` (modified — schema versioning)
  - `commands/setup.md` (modified — add blast_radius_depth to config template)
  - `commands/review.md` (modified — read depth from project-config.json)
  - `install.sh` (modified — fix misleading pip message)
  - `hooks/session_stop.py` (modified — increase timeout)
- ⚠️ Breaking change risk: none

## Reusable Existing Code
- `_init_db()` sqlite3 pattern di `server/memory.py:14` — extended dengan `_migrate()` method
- project-config.json template di `commands/setup.md:51` — tambah satu field

## Tasks
- [ ] Task 1: Schema versioning in memory.py [S] — tambah SCHEMA_VERSION + _migrate() ke MemoryEngine
- [ ] Task 2: Add blast_radius_depth to setup.md template [S] — tambah field ke project-config.json template
- [ ] Task 3: Read blast_radius_depth in review.md [S] — baca depth dari project-config.json saat blast radius query
- [ ] Task 4: Fix install.sh pip message [S] — ganti string inaccurate
- [ ] Task 5: Increase session_stop timeout [S] — 3s → 10s

## Per Task Detail

**Task 1 — Schema versioning in memory.py** `S`
- File: `server/memory.py`
- Code sample:
  ```python
  SCHEMA_VERSION = 1
  _MIGRATIONS: dict[int, list[str]] = {}

  # In MemoryEngine.__init__(), after _init_db():
  self._migrate()

  def _migrate(self):
      try:
          with sqlite3.connect(self.db_path) as conn:
              conn.execute('''
                  CREATE TABLE IF NOT EXISTS schema_version (
                      version INTEGER NOT NULL
                  )
              ''')
              row = conn.execute('SELECT version FROM schema_version LIMIT 1').fetchone()
              current = row[0] if row else 0
              if current < SCHEMA_VERSION:
                  for v in range(current + 1, SCHEMA_VERSION + 1):
                      for sql in _MIGRATIONS.get(v, []):
                          conn.execute(sql)
                  if row:
                      conn.execute('UPDATE schema_version SET version = ?', (SCHEMA_VERSION,))
                  else:
                      conn.execute('INSERT INTO schema_version (version) VALUES (?)', (SCHEMA_VERSION,))
                  conn.commit()
      except Exception:
          pass
  ```
- Edge cases: DB lama tanpa schema_version → treated as v0, migration v1 = no-op; DB corrupt → silent fail
- ⚠️ Breaking change: none
- Verify: `python3 -c "import ast; ast.parse(open('server/memory.py').read()); print('ok')"` + `grep -c "schema_version" server/memory.py` >= 3
- Dependencies: none

**Task 2 — Add blast_radius_depth to setup.md template** `S`
- File: `commands/setup.md`
- Code sample: replace project-config.json template to include `"blast_radius_depth": 2`
- ⚠️ Breaking change: none
- Verify: `grep "blast_radius_depth" commands/setup.md` returns 1 line
- Dependencies: none

**Task 3 — Read blast_radius_depth in review.md** `S`
- File: `commands/review.md`
- Code sample: add before blast radius section:
  ```
  Read `blast_radius_depth` from `.claude/project-config.json` (default: 2 if field absent).
  ```
  Change query URL from `depth=2` to `depth={blast_radius_depth}`
- ⚠️ Breaking change: none — default stays 2
- Verify: `grep "blast_radius_depth" commands/review.md` returns 2+ lines
- Dependencies: none

**Task 4 — Fix install.sh pip message** `S`
- File: `install.sh`
- Code sample: `echo "  ✓ flask, chromadb, requests, tree-sitter installed"` → `echo "  ✓ Python dependencies installed"`
- ⚠️ Breaking change: none
- Verify: `grep "Python dependencies installed" install.sh` returns 1 line
- Dependencies: none

**Task 5 — Increase session_stop timeout** `S`
- File: `hooks/session_stop.py`
- Code sample: `timeout=3` → `timeout=10` in urlopen summarize call
- ⚠️ Breaking change: none
- Verify: `grep "timeout=10" hooks/session_stop.py` returns 1 line
- Dependencies: none
