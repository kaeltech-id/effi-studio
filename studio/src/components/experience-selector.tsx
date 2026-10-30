import { useCallback, useEffect, useId, useState } from 'react';
import { api } from '../lib/tauri-api';
import type { Experience, ExperienceId } from '../lib/types';
import { BrandMark } from './brand-mark';

/** Display copy lives here, not in the backend payload: `Experience` carries
 *  availability facts, and a release fact should never be re-typed as prose.
 *  The one string that IS a release fact — Verify's reason — is rendered
 *  verbatim from the payload instead. */
const COPY: Record<ExperienceId, { name: string; blurb: string }> = {
  build: { name: 'Build', blurb: 'Code with your agents.' },
  verify: { name: 'Verify', blurb: 'Test and capture evidence.' },
};

/** Availability as words, never as colour alone: the mint/muted split is a
 *  second channel on top of the label, not the label itself. */
function AvailabilityBadge({ available }: { available: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-lg border px-1.5 text-xs leading-[18px] ${
        available ? 'border-success/40 text-success' : 'border-border text-muted'
      }`}
    >
      {available ? 'Available' : 'Coming soon'}
    </span>
  );
}

interface EnableSwitchProps {
  name: string;
  enabled: boolean;
  /** False means the experience has not shipped, so the control is rendered
   *  `disabled` — the row around it stays live. */
  selectable: boolean;
  /** The reason paragraph, so a screen reader hears why this cannot be turned
   *  on at the moment it lands on the control. */
  describedBy?: string;
  onToggle: (next: boolean) => void;
}

/** The ONLY enable affordance. It is a sibling of the row's navigation button,
 *  never its parent or its child: nesting them would make `disabled` here
 *  swallow the navigation too, and that is exactly the thing Verify must keep.
 *
 *  Nothing in the disabled rendering is dimmed. The usual "greyed out" look
 *  lands near 2:1; `border-muted` on `bg-raised` measures 7.05:1, so the
 *  unavailable control stays as readable as the live one and says so with a
 *  dashed edge instead of with low contrast. */
function EnableSwitch({ name, enabled, selectable, describedBy, onToggle }: EnableSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`Enable ${name}`}
      aria-describedby={describedBy}
      disabled={!selectable}
      title={selectable ? `Enable ${name}` : `${name} cannot be enabled yet`}
      onClick={() => onToggle(!enabled)}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-sm leading-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent motion-reduce:transition-none ${
        enabled
          ? 'border-accent bg-accent text-on-accent'
          : selectable
            ? 'border-muted bg-raised text-transparent hover:bg-hover'
            : 'cursor-not-allowed border-dashed border-muted bg-raised text-transparent'
      }`}
    >
      {/* Drawn at every state so the box never changes size when it is ticked;
          only the colour moves. */}
      <span aria-hidden="true">✓</span>
    </button>
  );
}

interface ExperienceRowProps {
  experience: Experience;
  active: boolean;
  onOpen: (id: ExperienceId) => void;
  onToggle: (id: ExperienceId, next: boolean) => void;
}

function ExperienceRow({ experience, active, onOpen, onToggle }: ExperienceRowProps) {
  const reasonId = useId();
  const { name, blurb } = COPY[experience.id];
  const selectable = experience.availability === 'available';

  return (
    <li
      // Selection is accent and bg-ground, the same marker the project rows
      // use. Mint is reserved for health and must not appear here.
      className={`border-l-2 transition-colors duration-150 motion-reduce:transition-none ${
        experience.enabled ? 'border-accent bg-ground' : 'border-transparent'
      }`}
    >
      <div className="flex items-start gap-1 pr-2">
        {/* NAVIGATION. Never disabled — for Verify this opens the informational
            landing, which is the one thing the unreleased experience can do. */}
        <button
          type="button"
          onClick={() => onOpen(experience.id)}
          aria-current={active ? 'page' : undefined}
          className="flex min-w-0 flex-1 flex-col px-2 py-2 text-left transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent motion-reduce:transition-none"
        >
          {/* Wraps rather than truncates. At the 192px sidebar band the name,
              the availability badge and the checkbox do not fit on one line,
              and whichever element lacks `shrink-0` loses: first the name
              collapsed to `V...`, then giving it a floor pushed the badge to
              `Coming so...` and clipped the checkbox. Both are the same defect
              wearing a different victim. Letting the badge drop to its own line
              keeps every word readable at every band, and the card is already
              multi-line. */}
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {/* A floor, for the same reason as tree-row.tsx's project name: the
                badge beside this is `shrink-0`, so this span absorbs the whole
                deficit and collapsed `Verify` to `V...` in the 192px sidebar
                band, measured in a browser at 980x700. An experience the user
                cannot read the name of is not a choice. */}
            <span className="min-w-[3.5rem] truncate text-sm leading-[21px] text-text">
              {name}
            </span>
            <AvailabilityBadge available={selectable} />
          </span>
          <span className="pt-1 text-xs leading-[18px] text-muted">{blurb}</span>
        </button>

        <span className="flex items-center py-2">
          <EnableSwitch
            name={name}
            enabled={experience.enabled}
            selectable={selectable}
            describedBy={experience.reason ? reasonId : undefined}
            onToggle={(next) => onToggle(experience.id, next)}
          />
        </span>
      </div>

      {/* Outside the navigation button on purpose: it explains the switch, so
          folding it into the button's accessible name would attach it to the
          wrong control. */}
      {experience.reason && (
        <p id={reasonId} className="px-2 pb-2 text-xs leading-[18px] text-muted">
          {experience.reason}
        </p>
      )}
    </li>
  );
}

interface ExperienceSelectorProps {
  /** Which experience the shell is showing. Navigation state, not enablement:
   *  Verify can be the open page while staying off.
   *
   *  `null` means NONE of them is the open page, which is exactly what the host
   *  passes while Connections is up — see `connectionsActive`. */
  active?: ExperienceId | null;
  onOpen: (id: ExperienceId) => void;
  /** Fired after the write lands, so the shell can re-read what it needs. */
  onEnabledChange?: (buildEnabled: boolean) => void;
  /** TASK 109. Whether THE Connections surface is the open page. It owns the
   *  `aria-current="page"` marker while it is up, and the host passes
   *  `active: null` for the same moment — the defect this fixes was Build
   *  keeping the marker while its workspace sat hidden behind Connections. */
  connectionsActive?: boolean;
  /** Opens THE Connections surface. The host hands over the SAME setter the
   *  Settings drawer's Connections section calls, so this row is a second door
   *  to one page and never a second page: no component is mounted here, no
   *  draft is held here, and nothing here reads the connections matrix.
   *
   *  Omit it and the row is absent rather than inert — a host with no
   *  Connections surface has nothing for it to open. */
  onOpenConnections?: () => void;
}

/** Sits above the project list. Owns its own fetch because availability is a
 *  release fact the backend recomputes on every read — passing it down as a
 *  prop would give a stale shell a say in what has shipped. */
export function ExperienceSelector({
  active,
  onOpen,
  onEnabledChange,
  connectionsActive = false,
  onOpenConnections,
}: ExperienceSelectorProps) {
  const [items, setItems] = useState<Experience[] | null>(null);

  useEffect(() => {
    let alive = true;
    void api.experiences().then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleToggle = useCallback(
    (id: ExperienceId, next: boolean) => {
      // `set_experiences` takes only Build's flag, so there is no id to send
      // and no way for this call to name Verify. Guarded here as well, so a
      // future row cannot quietly start writing Build's value.
      if (id !== 'build') return;

      setItems(
        (prev) => prev?.map((e) => (e.id === 'build' ? { ...e, enabled: next } : e)) ?? prev,
      );
      void api
        .setExperiences(next)
        .then(() => onEnabledChange?.(next))
        // The optimistic tick was a guess; on failure the backend is the only
        // authority on what is actually enabled.
        .catch(() => api.experiences().then(setItems));
    },
    [onEnabledChange],
  );

  return (
    <>
      <section
        aria-labelledby="experience-selector-heading"
        className="w-full shrink-0 border-b border-border bg-surface p-2"
      >
        <h2
          id="experience-selector-heading"
          className="flex items-center gap-2 px-2 pt-1 pb-2 text-sm leading-[20px] font-semibold text-text"
        >
          <span className="text-accent">
            <BrandMark size={16} />
          </span>
          Experiences
        </h2>

        {items === null ? (
          <p className="px-2 pb-1 text-xs leading-[18px] text-muted">loading…</p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-raised">
            {items.map((experience) => (
              <ExperienceRow
                key={experience.id}
                experience={experience}
                active={active === experience.id}
                onOpen={onOpen}
                onToggle={handleToggle}
              />
            ))}
          </ul>
        )}
      </section>

      {/* TASK 109. The Connections entry.

        Its own block, OUTSIDE the Experiences section: Connections is not an
        experience — it has no availability, no enable switch and no release
        fact — so listing it under that heading would say it was one. No
        heading of its own either; the nav's own label is the whole name it
        needs.

        It mounts NOTHING. The press leaves through `onOpenConnections`, which
        is the same setter the Settings drawer's Connections section calls, so
        both doors flip one flag and reach the one ConnectionsPage the host has
        mounted. A page of its own here would be a second configure draft, a
        second error string and a second reading of the same matrix.

        The marker is accent and bg-ground, the same selection marker the
        experience rows and the project rows use — mint is health and must not
        appear on a selection. */}
      {onOpenConnections && (
        <nav
          aria-label="Workspace"
          className="w-full shrink-0 border-b border-border bg-surface p-2"
        >
          <ul className="overflow-hidden rounded-xl border border-border bg-raised">
            <li
              className={`border-l-2 transition-colors duration-150 motion-reduce:transition-none ${
                connectionsActive ? 'border-accent bg-ground' : 'border-transparent'
              }`}
            >
              <button
                type="button"
                onClick={onOpenConnections}
                // The highlight, while Connections is the open page. The host
                // passes `active: null` for the same moment, so exactly one row
                // in this sidebar carries the marker at a time.
                aria-current={connectionsActive ? 'page' : undefined}
                className="flex w-full min-w-0 flex-col px-2 py-2 text-left transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent motion-reduce:transition-none"
              >
                <span className="min-w-0 truncate text-sm leading-[21px] text-text">
                  Connections
                </span>
                <span className="pt-1 text-xs leading-[18px] text-muted">
                  One surface, two doors — this and Settings open the same page.
                </span>
              </button>
            </li>
          </ul>
        </nav>
      )}
    </>
  );
}
