import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Doctor, Project, ProjectState, TreeLevel } from './types';

/**
 * The single typed boundary to the Rust side. Components import from here and
 * never call invoke() themselves — one wrapper per command is what keeps a
 * renamed argument a type error instead of a silent undefined.
 */
export const api = {
  resolveClaude: (overridePath: string | null = null) =>
    invoke<string>('resolve_claude', { overridePath }),

  runDoctor: (overridePath: string | null = null) =>
    invoke<Doctor>('run_doctor', { overridePath }),
  installEfficlaude: () => invoke<void>('install_efficlaude'),
  installSessionId: () => invoke<string>('install_session_id'),

  claudeOverride: () => invoke<string | null>('claude_override'),
  setClaudeOverride: (path: string | null) => invoke<void>('set_claude_override', { path }),

  listProjects: () => invoke<Project[]>('list_projects'),

  listChildren: (path: string, stopAt: string | null = null) =>
    invoke<TreeLevel>('list_children', { path, stopAt }),

  promoteProject: (path: string) => invoke<Project>('promote_project', { path }),

  addProject: () => invoke<Project | null>('add_project'),
  removeProject: (id: string) => invoke<void>('remove_project', { id }),
  readState: (path: string) => invoke<ProjectState>('read_project_state', { path }),

  ptyOpen: (id: string, cwd: string, program: string) =>
    invoke<void>('pty_open', { id, cwd, program }),
  ptyWrite: (id: string, data: string) => invoke<void>('pty_write', { id, data }),
  ptyResize: (id: string, rows: number, cols: number) =>
    invoke<void>('pty_resize', { id, rows, cols }),
  ptyClose: (id: string) => invoke<void>('pty_close', { id }),
};

/** Each listener filters on the id itself: two open projects must not interleave. */
export function onPtyOutput(id: string, cb: (bytes: Uint8Array) => void): Promise<UnlistenFn> {
  return listen<[string, string]>('pty://output', (event) => {
    if (event.payload[0] !== id) return;
    const raw = atob(event.payload[1]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    cb(bytes);
  });
}

export function onPtyExit(id: string, cb: () => void): Promise<UnlistenFn> {
  return listen<string>('pty://exit', (event) => {
    if (event.payload === id) cb();
  });
}

export function onProjectState(
  cb: (id: string, state: ProjectState) => void,
): Promise<UnlistenFn> {
  return listen<[string, ProjectState]>('project://state', (event) =>
    cb(event.payload[0], event.payload[1]),
  );
}
