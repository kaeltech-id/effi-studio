import { useCallback, useEffect, useState } from 'react';
import { DoctorScreen } from './components/doctor-screen';
import { HistoryPanel } from './components/history-panel';
import { ProjectSidebar } from './components/project-sidebar';
import { StageRail } from './components/stage-rail';
import { TaskPanel } from './components/task-panel';
import { TerminalPane } from './components/terminal-pane';
import { api, onProjectState } from './lib/tauri-api';
import {
  doctorBlocking,
  type Doctor,
  type Project,
  type ProjectState,
  type TreeLevel,
} from './lib/types';

export default function App() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [dismissedDoctor, setDismissedDoctor] = useState(false);
  const [program, setProgram] = useState<string | null>(null);
  const [installId, setInstallId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Keyed by project id: a slow watcher callback must never write one project's
  // state into another's panel.
  const [states, setStates] = useState<Record<string, ProjectState>>({});
  // Expanded absolute paths, and the children loaded for them. Session only:
  // never persisted, so browsing can never disagree with studio.json.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [levels, setLevels] = useState<Record<string, TreeLevel>>({});

  const check = useCallback(async () => {
    const override = await api.claudeOverride().catch(() => null);
    const report = await api.runDoctor(override);
    setDoctor(report);
    setProgram(report.claude);
    return report;
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  // A failed fetch leaves it null, which disables Install rather than letting a
  // click open a session no pane is subscribed to.
  useEffect(() => {
    void api.installSessionId().then(setInstallId).catch(() => {});
  }, []);

  const loadProjects = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    setActiveId((current) => current ?? list[0]?.id ?? null);
    const entries = await Promise.all(
      list.map(async (p) => [p.id, await api.readState(p.path)] as const),
    );
    setStates(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // One subscription for every project, so background projects stay current.
  useEffect(() => {
    const unlisten = onProjectState((id, state) =>
      setStates((prev) => ({ ...prev, [id]: state })),
    );
    return () => void unlisten.then((off) => off());
  }, []);

  const handleAdd = useCallback(async () => {
    const added = await api.addProject();
    if (!added) return; // cancelling the panel is not an error
    setProjects((prev) => (prev.some((p) => p.id === added.id) ? prev : [...prev, added]));
    setActiveId(added.id);
    const state = await api.readState(added.path);
    setStates((prev) => ({ ...prev, [added.id]: state }));
    // The parent's cached level predates this folder, so drop it rather than
    // make the user collapse and reopen to see what they just added.
    const parent = added.path.slice(0, added.path.lastIndexOf('/'));
    setLevels((prev) => {
      if (!(parent in prev)) return prev;
      const next = { ...prev };
      delete next[parent];
      return next;
    });
  }, []);

  const handleToggle = useCallback(
    async (path: string) => {
      const open = !expanded.has(path);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      // Load once per path and keep it: collapsing and re-expanding must not
      // re-read the disk, and nothing is read for a path never opened. A failed
      // listing caches an empty level so the row settles on "empty" rather than
      // retrying on every render.
      if (!open || levels[path]) return;
      const level = await api.listChildren(path).catch(() => ({ children: [], hidden: 0 }));
      setLevels((prev) => ({ ...prev, [path]: level }));
    },
    [expanded, levels],
  );

  /** A child the user activated. It becomes a real project — persisted, watched,
   *  with its own terminal — because a workspace deliberately promoted should
   *  still be there after a relaunch. */
  const handlePromote = useCallback(async (path: string) => {
    // A rejected promotion means the folder was not persisted, so nothing is
    // added: a row the Rust side does not know about could never be removed.
    const added = await api.promoteProject(path).catch(() => null);
    if (!added) return;
    setProjects((prev) => (prev.some((p) => p.id === added.id) ? prev : [...prev, added]));
    setActiveId(added.id);
    const state = await api.readState(added.path);
    setStates((prev) => ({ ...prev, [added.id]: state }));
  }, []);

  const handleRemove = useCallback(async (id: string) => {
    await api.removeProject(id);
    await api.ptyClose(id).catch(() => {}); // no session open is fine
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setStates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setActiveId((current) => (current === id ? null : current));
  }, []);

  if (!doctor) {
    return <p className="p-4 text-sm text-muted">checking…</p>;
  }

  if ((doctorBlocking(doctor) && !dismissedDoctor) || !program) {
    return (
      <div className="flex h-screen bg-ground text-text">
        <DoctorScreen
          doctor={doctor}
          installSessionId={installId}
          onInstall={() => void api.installEfficlaude()}
          onRecheck={() => void check()}
          onContinue={() => setDismissedDoctor(true)}
          onOverride={(path) => {
            void api.setClaudeOverride(path).then(check);
          }}
        />
      </div>
    );
  }

  const active = projects.find((p) => p.id === activeId) ?? null;
  const activeState = activeId ? (states[activeId] ?? null) : null;

  return (
    <div className="flex h-screen bg-ground text-text">
      <ProjectSidebar
        projects={projects}
        activeId={activeId}
        states={states}
        expanded={expanded}
        levels={levels}
        onSelect={setActiveId}
        onToggle={(p) => void handleToggle(p)}
        onPromote={(p) => void handlePromote(p)}
        onAdd={handleAdd}
        onRemove={(id) => void handleRemove(id)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-10 items-center gap-3 border-b border-border px-3">
          <span className="truncate text-sm">{active?.name ?? 'No project selected'}</span>
          <StageRail stage={activeState?.stage ?? 'Idle'} size="md" />
          <span className="font-mono text-xs text-muted">
            {activeState ? `${activeState.done}/${activeState.total} · ${activeState.branch}` : ''}
          </span>
        </header>

        <div className="relative min-h-0 flex-1">
          {/* Every pane stays mounted and is hidden when inactive — unmounting
              would kill a running /ec-execute in that project. */}
          {projects.map((p) => (
            <div key={p.id} className={`h-full w-full ${p.id === activeId ? '' : 'hidden'}`}>
              <TerminalPane projectId={p.id} cwd={p.path} program={program} />
            </div>
          ))}
          {projects.length === 0 && (
            <p className="p-4 text-sm text-muted">Add a folder to open a terminal in it.</p>
          )}
        </div>
      </main>

      <aside className="flex w-80 shrink-0 flex-col border-l border-border">
        <div className="min-h-0 flex-1 border-b border-border">
          <TaskPanel state={activeState} />
        </div>
        <div className="min-h-0 flex-1">
          <HistoryPanel history={activeState?.history ?? []} />
        </div>
      </aside>
    </div>
  );
}
