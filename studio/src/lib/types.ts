export type Stage = 'Idle' | 'Brainstorm' | 'Plan' | 'Refine' | 'Execute' | 'Review';

/** Mirrors the Rust GitMark in tree.rs. Three states, not a boolean: a folder
 *  inside a repository is neither a repository nor unrelated to one. */
export type GitMark = 'repo' | 'inRepo' | 'plain';

export interface Project {
  id: string;
  name: string;
  path: string;
  gitMark: GitMark;
}

/** One directory as the sidebar renders it. `hasChildren` decides whether a
 *  chevron is drawn at all, so a leaf never offers an empty expansion. */
export interface TreeChild {
  name: string;
  path: string;
  gitMark: GitMark;
  hasChildren: boolean;
}

export interface TreeLevel {
  children: TreeChild[];
  hidden: number;
}

export interface Task {
  done: boolean;
  text: string;
}

export interface HistoryEntry {
  file: string;
  branch: string;
  date: string;
  time: string;
  slug: string;
  title: string | null;
}

export interface ProjectState {
  branch: string;
  stage: Stage;
  tasks: Task[];
  done: number;
  total: number;
  featureTitle: string | null;
  rawPlan: string | null;
  history: HistoryEntry[];
  hasDecision: boolean;
  /** True once `.claude/.review-done-{branch}` exists. `stage` reads `Review`
   *  either side of that line, so this is what tells the flow bar to name git
   *  instead of offering review again. */
  reviewDone: boolean;
}

/** The five dots of the stage rail, in workflow order. `Idle` is not one of them. */
export const STAGES: Stage[] = ['Brainstorm', 'Plan', 'Refine', 'Execute', 'Review'];

export interface BranchInfo {
  name: string;
  current: boolean;
}

/** `detached` is explicit rather than inferred from a null branch: the Rust
 *  side distinguishes a detached HEAD from a folder it could not read. */
export interface GitInfo {
  available: boolean;
  branch: string | null;
  detached: boolean;
  branches: BranchInfo[];
  hidden: number;
  error: string | null;
}

export interface PanelState {
  propertiesCollapsed: boolean;
  tasksCollapsed: boolean;
  historyCollapsed: boolean;
  sidebarCollapsed: boolean;
  flowCollapsed: boolean;
}

export interface Doctor {
  claude: string | null;
  commandsFound: number;
  commandsExpected: number;
  agentsFound: number;
  agentsExpected: number;
  workerOk: boolean;
}

/** The worker is optional — only the first two rows gate the shell. */
export function doctorBlocking(d: Doctor): boolean {
  return !d.claude || d.commandsFound < d.commandsExpected;
}
