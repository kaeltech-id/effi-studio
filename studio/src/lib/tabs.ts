/** The kinds of surface a tab can host. `agent` is the only one that answers to
 *  a provider; the rest are driven by the tab itself. */
export type TabType = 'agent' | 'shell' | 'browser' | 'ios' | 'android';

export interface Tab {
  /** Stable across restarts and independent of projectId: one project holds
   *  many tabs, and two tabs of the same type must be distinguishable. */
  id: string;
  projectId: string;
  type: TabType;
  title: string;
  /** Only for 'agent'. Identifies the provider, not the process. */
  providerId: string | null;
  /** The live process, if one exists. Null after a restart: tab metadata is
   *  persisted, but `kill_all_sessions` (lib.rs:165) ends every PTY on quit, so
   *  a restored tab is reconstructed without one and cannot claim otherwise. */
  sessionId: string | null;
}
