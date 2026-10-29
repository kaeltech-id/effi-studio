import { useCallback, useEffect, useMemo, useState } from 'react';
import { DoctorScreen } from './components/doctor-screen';
import { HistoryPanel } from './components/history-panel';
import { ProjectSidebar } from './components/project-sidebar';
import { StageRail } from './components/stage-rail';
import { TaskPanel } from './components/task-panel';
import { FlowBar } from './components/flow-bar';
import { PanelSection } from './components/panel-section';
import { PropertiesPanel } from './components/properties-panel';
import { TerminalPane } from './components/terminal-pane';
import { api, onProjectState } from './lib/tauri-api';
import { nextStep } from './lib/flow';
import { useShortcuts } from './lib/use-shortcuts';
import {
  doctorBlocking,
  type Doctor,
  type Project,
  type GitInfo,
  type PanelState,
  type ProjectState,
  type TreeLevel,
} from './lib/types';

/** Only the three fields a sidebar row renders. A `.claude/` write that
 *  changes none of them must not light up a marker. */
function seenKey(s: ProjectState | undefined): string {
  return s ? `${s.stage}:${s.done}:${s.total}` : '';
}

export default function App() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [dismissedDoctor, setDismissedDoctor] = useState(false);
  const [program, setProgram] = useState<string | null>(null);
  const [installId, setInstallId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [gitBusy, setGitBusy] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [panels, setPanelsState] = useState<PanelState>({
    propertiesCollapsed: false,
    tasksCollapsed: false,
    historyCollapsed: false,
    sidebarCollapsed: false,
    flowCollapsed: false,
  });
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

  // A failed read leaves every section open, matching the Rust default, so the
  // rail never blocks on a preference.
  useEffect(() => {
    void api.panels().then(setPanelsState).catch(() => {});
  }, []);

  const togglePanel = useCallback((key: keyof PanelState) => {
    setPanelsState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Persisted on change rather than on unmount: the app is usually quit,
      // so an unmount handler would often never run.
      void api.setPanels(next).catch(() => {});
      return next;
    });
  }, []);

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

  // The active project is marked seen as its state arrives, so it can never
  // carry a marker. Every other project's record is left alone until selected.
  useEffect(() => {
    if (!activeId) return;
    setSeen((prev) => {
      const key = seenKey(states[activeId]);
      return prev[activeId] === key ? prev : { ...prev, [activeId]: key };
    });
  }, [activeId, states]);

  const handleSelect = useCallback(
    (id: string) => {
      setActiveId(id);
      setSeen((prev) => ({ ...prev, [id]: seenKey(states[id]) }));
    },
    [states],
  );

  /** Types the command into the active session. `\r` is exactly what xterm's
   *  onData sends for Return (terminal-pane.tsx:49-51), so this is
   *  indistinguishable from the user typing it. No readiness check: the app
   *  cannot observe whether the REPL is at a prompt, and faking that signal
   *  would be worse than the honest behaviour. A rejected write is swallowed
   *  because the terminal itself is the error surface. */
  const handleDispatch = useCallback(
    (text: string) => {
      if (!activeId) return;
      void api.ptyWrite(activeId, `${text}\r`).catch(() => {});
      setFocusNonce((n) => n + 1);
    },
    [activeId],
  );

  const activity = useMemo(
    () =>
      new Set(
        projects
          .filter((p) => p.id !== activeId && seenKey(states[p.id]) !== (seen[p.id] ?? ''))
          .map((p) => p.id),
      ),
    [projects, states, seen, activeId],
  );

  // Derived above the early returns: the git effect below depends on it, and a
  // hook cannot sit after a conditional return.
  const active = projects.find((p) => p.id === activeId) ?? null;
  const activeState = activeId ? (states[activeId] ?? null) : null;

  // git_info never rejects by design, so a failure arrives inside the payload.
  useEffect(() => {
    if (!active) {
      setGitInfo(null);
      return;
    }
    void api.gitInfo(active.path).then(setGitInfo).catch(() => setGitInfo(null));
  }, [active]);

  const handleCheckout = useCallback(
    async (branch: string) => {
      if (!active) return;
      setGitBusy(true);
      setGitError(null);
      try {
        setGitInfo(await api.gitCheckout(active.path, branch));
        // The watcher only watches .claude/, so a branch change produces no
        // event. The plan is branch scoped, so stage and tasks are refreshed
        // here rather than waited for.
        const state = await api.readState(active.path);
        setStates((prev) => ({ ...prev, [active.id]: state }));
      } catch (e) {
        // git's own stderr, shown verbatim. No retry, no force.
        setGitError(String(e));
      } finally {
        setGitBusy(false);
      }
    },
    [active],
  );

  const handleCreateBranch = useCallback(
    async (name: string) => {
      if (!active) return;
      setGitBusy(true);
      setGitError(null);
      try {
        setGitInfo(await api.gitCreateBranch(active.path, name));
        const state = await api.readState(active.path);
        setStates((prev) => ({ ...prev, [active.id]: state }));
      } catch (e) {
        setGitError(String(e));
      } finally {
        setGitBusy(false);
      }
    },
    [active],
  );

  // Indexes the CONFIGURED project list, not the visible tree rows: expanding a
  // folder changes which rows are visible, and a shortcut whose target moves is
  // worse than no shortcut. Out-of-range indices are ignored.
  useShortcuts({
    onProjectIndex: useCallback(
      (index: number) => {
        const p = projects[index - 1];
        if (p) handleSelect(p.id);
      },
      [projects, handleSelect],
    ),
    onToggleSidebar: useCallback(() => togglePanel('sidebarCollapsed'), [togglePanel]),
    onToggleFlow: useCallback(() => togglePanel('flowCollapsed'), [togglePanel]),
    onToggleRail: useCallback(() => {
      // One key for the whole rail: collapse all three when any is open,
      // otherwise reopen all three. A per-section key would need three more.
      const anyOpen =
        !panels.propertiesCollapsed || !panels.tasksCollapsed || !panels.historyCollapsed;
      const next = {
        ...panels,
        propertiesCollapsed: anyOpen,
        tasksCollapsed: anyOpen,
        historyCollapsed: anyOpen,
      };
      setPanelsState(next);
      void api.setPanels(next).catch(() => {});
    }, [panels]),
  });

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

  return (
    <div className="flex h-screen bg-ground text-text">
      {!panels.sidebarCollapsed && (
        <ProjectSidebar
          projects={projects}
          activeId={activeId}
          states={states}
          expanded={expanded}
          levels={levels}
          activity={activity}
          onSelect={handleSelect}
          onToggle={(p) => void handleToggle(p)}
          onPromote={(p) => void handlePromote(p)}
          onAdd={handleAdd}
          onRemove={(id) => void handleRemove(id)}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-10 items-center gap-3 border-b border-border px-3">
          <span className="truncate text-sm">{active?.name ?? 'No project selected'}</span>
          <StageRail stage={activeState?.stage ?? 'Idle'} size="md" />
          <span className="font-mono text-xs text-muted">
            {activeState ? `${activeState.done}/${activeState.total} · ${activeState.branch}` : ''}
          </span>
        </header>

        <FlowBar
          next={nextStep(activeState)}
          collapsed={panels.flowCollapsed}
          onToggle={() => togglePanel('flowCollapsed')}
          onDispatch={activeId ? handleDispatch : null}
        />

        <div className="relative min-h-0 flex-1">
          {/* Every pane stays mounted and is hidden when inactive — unmounting
              would kill a running /ec-execute in that project. */}
          {projects.map((p) => (
            <div key={p.id} className={`h-full w-full ${p.id === activeId ? '' : 'hidden'}`}>
              <TerminalPane
                projectId={p.id}
                cwd={p.path}
                program={program}
                focusNonce={p.id === activeId ? focusNonce : 0}
              />
            </div>
          ))}
          {projects.length === 0 && (
            <p className="p-4 text-sm text-muted">Add a folder to open a terminal in it.</p>
          )}
        </div>
      </main>

      <aside className="flex w-80 shrink-0 flex-col border-l border-border">
        <PanelSection
          title="Properties"
          collapsed={panels.propertiesCollapsed}
          onToggle={() => togglePanel('propertiesCollapsed')}
          detail={gitInfo?.branch ?? undefined}
        >
          <PropertiesPanel
            gitInfo={gitInfo}
            incompleteTasks={activeState ? activeState.total - activeState.done : 0}
            busy={gitBusy}
            error={gitError}
            onCheckout={(b) => void handleCheckout(b)}
            onCreateBranch={(n) => void handleCreateBranch(n)}
          />
        </PanelSection>

        <PanelSection
          title="Tasks"
          collapsed={panels.tasksCollapsed}
          onToggle={() => togglePanel('tasksCollapsed')}
          detail={activeState ? `${activeState.done}/${activeState.total}` : undefined}
        >
          <TaskPanel state={activeState} />
        </PanelSection>

        <PanelSection
          title="History"
          collapsed={panels.historyCollapsed}
          onToggle={() => togglePanel('historyCollapsed')}
          detail={activeState?.history.length ? String(activeState.history.length) : undefined}
        >
          <HistoryPanel history={activeState?.history ?? []} />
        </PanelSection>
      </aside>
    </div>
  );
}
