import type { ReactNode } from 'react';
import type { ExperienceId } from '../lib/types';
import { BrandMark } from './brand-mark';

/** Connections sits in the same nav group as the two experiences but is not
 *  one — it has no availability and no enable switch — so the id is a union
 *  rather than a third `ExperienceId`. */
export type RailSectionId = ExperienceId | 'connections';

export interface WorkspaceRailUser {
  /** The real signed-in name. The mockup's sample name is never a fallback:
   *  no name means no profile row. */
  name: string;
  /** Overrides the initials derived from `name`. */
  initials?: string;
}

const ICON = 'h-[18px] w-[18px]';

interface IconProps {
  className?: string;
}

function strokeProps(className = ICON) {
  return {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

function CodeIcon() {
  return (
    <svg {...strokeProps()}>
      <path d="M9.5 16.5 4.5 12l5-4.5" />
      <path d="m14.5 7.5 5 4.5-5 4.5" />
      <path d="m13.2 5.8-2.4 12.4" />
    </svg>
  );
}

function SearchIcon({ className }: IconProps) {
  return (
    <svg {...strokeProps(className)}>
      <circle cx="11" cy="11" r="6.25" />
      <path d="m20 20-4.4-4.4" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg {...strokeProps()}>
      <path d="M10.2 13.2a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 1 0-5.66-5.66l-1.41 1.41" />
      <path d="M13.8 10.8a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 1 0 5.66 5.66l1.41-1.41" />
    </svg>
  );
}

function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...strokeProps(className)}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </svg>
  );
}

function PlusIcon({ className }: IconProps) {
  return (
    <svg {...strokeProps(className)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg {...strokeProps()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.1 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 .97-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47.97H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.47.97z" />
    </svg>
  );
}

interface RailSection {
  id: RailSectionId;
  name: string;
  blurb: string;
  Icon: (props: IconProps) => ReactNode;
}

/** The Contract's nav copy. `experience-selector.tsx:11-12` carries the same
 *  two experience strings; that const is module-private and the file is out of
 *  scope for this task, so the pair lives here keyed by the shared id type and
 *  the two spellings must be folded into one exported map as soon as the
 *  selector can be edited. */
const SECTIONS: readonly RailSection[] = [
  { id: 'build', name: 'Build', blurb: 'Code with your agents.', Icon: CodeIcon },
  { id: 'verify', name: 'Verify', blurb: 'Test and capture evidence.', Icon: SearchIcon },
  { id: 'connections', name: 'Connections', blurb: 'One surface, two doors.', Icon: LinkIcon },
];

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent';
const MOTION = 'transition-colors duration-150 motion-reduce:transition-none';

interface NavCardProps {
  section: RailSection;
  selected: boolean;
  onSelect: (id: RailSectionId) => void;
}

function NavCard({ section, selected, onSelect }: NavCardProps) {
  const { Icon } = section;

  return (
    <button
      type="button"
      onClick={() => onSelect(section.id)}
      aria-current={selected ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${MOTION} ${FOCUS} ${
        selected ? 'border-accent/60 bg-brand-blue/25' : 'border-transparent hover:bg-hover'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          selected ? 'bg-brand-blue text-text' : 'text-muted'
        }`}
      >
        <Icon />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm leading-[20px] font-semibold text-text">
          {section.name}
        </span>
        <span className="truncate pt-0.5 text-xs leading-[18px] text-muted">{section.blurb}</span>
      </span>
      {selected && <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />}
    </button>
  );
}

function initialsOf(user: WorkspaceRailUser): string {
  if (user.initials?.trim()) return user.initials.trim().slice(0, 2).toUpperCase();
  const parts = user.name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

function ProfileRow({ user, onProfile }: { user: WorkspaceRailUser; onProfile?: () => void }) {
  const body = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-text">
        {initialsOf(user)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm leading-[20px] text-text">{user.name}</span>
    </>
  );

  // The chevron is an affordance, so it is drawn only when pressing the row
  // actually opens something.
  if (!onProfile) {
    return <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onProfile}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-hover ${MOTION} ${FOCUS}`}
    >
      {body}
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
    </button>
  );
}

export interface WorkspaceRailProps {
  /** Which nav card is the open page; `null` while none of them is. */
  experience: RailSectionId | null;
  onExperience: (id: RailSectionId) => void;
  search: string;
  onSearch: (value: string) => void;
  onAddProject: () => void;
  onSettings: () => void;
  /** Omitted or null when the app does not know a user — the row is then
   *  absent rather than filled with a placeholder name. */
  user?: WorkspaceRailUser | null;
  onProfile?: () => void;
  /** The project list. The rail is the shell around it and owns no list state
   *  beyond the search string it hands back. */
  children: ReactNode;
}

export function WorkspaceRail({
  experience,
  onExperience,
  search,
  onSearch,
  onAddProject,
  onSettings,
  user,
  onProfile,
  children,
}: WorkspaceRailProps) {
  const named = user && user.name.trim() ? user : null;

  return (
    <aside
      aria-label="Workspace"
      className="flex w-[300px] min-w-0 shrink-0 flex-col border-r border-border bg-ground"
    >
      <div className="flex shrink-0 items-center gap-2.5 px-4 py-4">
        <span className="text-accent">
          <BrandMark size={28} />
        </span>
        <span className="text-[22px] leading-[28px] font-semibold text-text">Effi Studio</span>
      </div>

      <nav aria-label="Sections" className="flex shrink-0 flex-col gap-1.5 px-3">
        {SECTIONS.map((section) => (
          <NavCard
            key={section.id}
            section={section}
            selected={experience === section.id}
            onSelect={onExperience}
          />
        ))}
      </nav>

      <div className="mt-4 flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 pt-4">
        <h2 className="text-[11px] leading-[16px] font-semibold tracking-wider text-muted uppercase">
          WORKSPACE
        </h2>
        <button
          type="button"
          aria-label="Add a project"
          onClick={onAddProject}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-muted hover:bg-hover hover:text-text ${MOTION} ${FOCUS}`}
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="shrink-0 px-3 pt-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            aria-label="Find a project"
            placeholder="Find a project…"
            className="w-full rounded-lg border border-border bg-surface py-2 pr-3 pl-9 text-sm leading-[20px] text-text placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>

      <div className="flex shrink-0 flex-col gap-1 border-t border-border p-3">
        <button
          type="button"
          onClick={onAddProject}
          className={`flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm leading-[20px] text-text hover:bg-hover ${MOTION} ${FOCUS}`}
        >
          <PlusIcon className="h-[18px] w-[18px] shrink-0 text-muted" />
          Add project
        </button>
        <button
          type="button"
          onClick={onSettings}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm leading-[20px] text-text hover:bg-hover ${MOTION} ${FOCUS}`}
        >
          <span className="shrink-0 text-muted">
            <GearIcon />
          </span>
          Settings
        </button>
        {named && <ProfileRow user={named} onProfile={onProfile} />}
      </div>
    </aside>
  );
}
