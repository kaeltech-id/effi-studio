import type { ProjectState, Stage } from './types';

export interface FlowStep {
  /** The literal text typed into the session, and the button's own label.
   *  Never paraphrased: the row exists to teach this string. */
  command: string;
  /** The stage this step serves. `null` for git, which is not a stage. */
  stage: Stage | null;
  hint: string;
}

/** Fixed order, from the workflow in CLAUDE.md. */
export const FLOW_STEPS: FlowStep[] = [
  {
    command: '/ec-brainstorm',
    stage: 'Brainstorm',
    hint: 'Explore approaches and save one decision',
  },
  { command: '/ec-plan', stage: 'Plan', hint: 'Turn the decision into a flat task list' },
  { command: '/ec-refine', stage: 'Refine', hint: 'Dry run every verify before any code exists' },
  { command: '/ec-execute', stage: 'Execute', hint: 'Run the tasks one at a time' },
  { command: '/ec-review', stage: 'Review', hint: 'Check the result against the plan' },
  { command: '/ec-git', stage: null, hint: 'Commit and push, with its own confirmations' },
];

/** The step a project is waiting on. `derive_stage` in plan.rs returns the stage
 *  the project has NOT done yet, so for every stage but Idle the stage is itself
 *  the next action. Pure: the one routing authority is the Rust side, and
 *  re-deriving it from disk here could disagree with the driver. */
export function nextStep(state: ProjectState | null): FlowStep | null {
  if (!state) return null;
  if (state.reviewDone) return FLOW_STEPS[FLOW_STEPS.length - 1];
  if (state.stage === 'Idle') return FLOW_STEPS[0];
  return FLOW_STEPS.find((s) => s.stage === state.stage) ?? null;
}
