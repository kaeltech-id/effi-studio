export type Stage = 'Idle' | 'Brainstorm' | 'Feature' | 'Execute' | 'Review';

export interface Project {
  id: string;
  name: string;
  path: string;
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
