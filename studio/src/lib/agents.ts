/**
 * The provider registry as the Rust side reports it. Mirrors agents.rs:100-126
 * (`Agent`), agents.rs:71-77 (`Capabilities`), agents.rs:93-98 (`ConfigScope`)
 * and agents.rs:100-105 (`AgentStatus`) — each of which carries
 * `#[serde(rename_all = "camelCase")]`, so the keys and the enum spellings
 * below are the wire form, not a translation of the Rust field names.
 */

/** Declared per provider, never derived from its id or name: a capability
 *  exists when the code implementing it does (agents.rs:68-77). */
export interface Capabilities {
  workflowAdapter: boolean;
  resumeSession: boolean;
  slashCommands: boolean;
}

/** Where a definition comes from, and therefore what the user may edit: a
 *  built-in accepts only a path override, a user-defined CLI is editable in
 *  full. camelCase variants, from `#[serde(rename_all = "camelCase")]` on the
 *  enum itself (agents.rs:93-98) — `BuiltIn` is `builtIn` on the wire. */
export type ConfigScope = 'builtIn' | 'user';

/** `needsAttention` means discovery failed, which is reportable rather than a
 *  reason to drop the row (agents.rs:112-115). */
export type AgentStatus = 'ready' | 'needsAttention';

export interface Agent {
  id: string;
  name: string;
  /** The resolved absolute path, or null when discovery failed. A provider the
   *  user has not installed yet is still listed, nameable and fixable. */
  program: string | null;
  /** argv after the program, never one joined command line: anything that
   *  re-split a joined string on spaces would break a path containing one. */
  args: string[];
  capabilities: Capabilities;
  scope: ConfigScope;
  status: AgentStatus;
  /** Why the status is needsAttention, in the resolver's own words, so the UI
   *  can name the path that was tried instead of saying "not found". */
  detail: string | null;
}
