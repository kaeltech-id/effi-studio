export type Stage = 'Idle' | 'Brainstorm' | 'Feature' | 'Execute' | 'Review';

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
}

/** The four dots of the stage rail, in workflow order. `Idle` is not one of them. */
export const STAGES: Stage[] = ['Brainstorm', 'Feature', 'Execute', 'Review'];

export interface Doctor {
  claude: string | null;
  commandsFound: number;
  commandsExpected: number;
  workerOk: boolean;
}

/** The worker is optional — only the first two rows gate the shell. */
export function doctorBlocking(d: Doctor): boolean {
  return !d.claude || d.commandsFound < d.commandsExpected;
}
