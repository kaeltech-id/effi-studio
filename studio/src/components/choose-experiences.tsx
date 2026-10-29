import { useState } from 'react';
import { BrandMark } from './brand-mark';

/** Outline marks at the spec's stroke weight, inline so `currentColor` keeps
 *  each one on the token its container already set. Same helper shape as
 *  verify-landing.tsx — the two screens are one product. */
function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative: every mark here sits beside the text that names it.
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const TERMINAL = 'M7 9l3 3-3 3 M13.5 15H17';
const SHIELD = 'M12 3l7 3v6c0 4-3 6.5-7 9-4-2.5-7-5-7-9V6l7-3z M9 12l2 2 4-4';
const INFO = 'M12 3a9 9 0 110 18 9 9 0 010-18z M12 11v5 M12 8h.01';

/** The whole breakpoint policy, on one line, because a later task formalises
 *  it. The editorial column is decoration: dropping it costs no control. */
const EDITORIAL_COLUMN_VISIBILITY = 'hidden lg:flex';

/** Position in the flow, not progress through it — these are three named
 *  places, so nothing here animates or fills. */
const STEPS = ['Choose experiences', 'Choose tools', 'Open workspace'] as const;

/** What the user asked for, and nothing else. There is no `verify` field while
 *  Verify is unreleased, so no caller can be handed an intent that implies an
 *  install we cannot perform. */
export interface ExperienceIntent {
  build: boolean;
}

interface ExperienceCardProps {
  controlId: string;
  title: string;
  badge: string;
  /** Copper is selection and primary action; sage is healthy. A checked box is
   *  never sage, and an availability badge is never copper. */
  badgeTone: 'available' | 'comingSoon';
  summary: string;
  /** Second line under the summary: the capability list, or the reason a
   *  disabled control is disabled. */
  note: string;
  icon: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}

function ExperienceCard({
  controlId,
  title,
  badge,
  badgeTone,
  summary,
  note,
  icon,
  checked,
  disabled = false,
  onChange,
}: ExperienceCardProps) {
  const labelId = `${controlId}-label`;
  const descriptionId = `${controlId}-description`;

  // Disabled is dimmed by *token*, never by opacity: the muted token clears
  // 4.5:1 on every surface here, and an opacity pass would drag it to ~2:1.
  const frame = disabled
    ? 'border-border bg-surface'
    : checked
      ? 'border-copper bg-copper-tint'
      : 'border-border bg-surface hover:border-hover hover:bg-raised';

  return (
    <label
      htmlFor={controlId}
      className={`flex items-start gap-4 rounded-xl border p-6 transition-colors duration-150 motion-reduce:transition-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-copper has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-ground ${frame} ${
        disabled ? 'cursor-default' : 'cursor-pointer'
      }`}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-raised ${
          disabled ? 'text-muted' : 'text-copper'
        }`}
      >
        <Icon path={icon} size={22} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-3">
          {/* Full text token even when disabled — "readable disabled control"
              is the requirement, so only the affordance greys out, not the
              name of the thing. */}
          <span id={labelId} className="text-[20px] leading-[28px] font-semibold text-text">
            {title}
          </span>
          <span
            className={`rounded-lg border px-2 py-0.5 text-xs leading-[18px] font-semibold tracking-[0.08em] uppercase ${
              badgeTone === 'available'
                ? 'border-success/40 text-success'
                : 'border-border text-muted'
            }`}
          >
            {badge}
          </span>
        </span>

        <span id={descriptionId} className="block">
          <span className="block pt-2 text-sm leading-[21px] text-muted">{summary}</span>
          <span className="block pt-2 text-sm leading-[21px] text-muted">{note}</span>
        </span>
      </span>

      {/* Native checkbox, kept in the a11y tree and in the tab order; only its
          paint is ours. `peer` drives the tick so the box has no second,
          desynchronisable source of truth. */}
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        <input
          id={controlId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          // Named by the title alone; the prose is a description, so a screen
          // reader announces "Verify, checkbox, dimmed" and then the reason,
          // rather than one run-on name.
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          onChange={(e) => onChange?.(e.target.checked)}
          className="peer h-6 w-6 appearance-none rounded-lg border border-border bg-raised transition-colors duration-150 checked:border-copper checked:bg-copper focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none disabled:cursor-default motion-reduce:transition-none"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-on-copper opacity-0 transition-opacity duration-150 peer-checked:opacity-100 motion-reduce:transition-none">
          <Icon path="M5 12.5l4.5 4.5L19 7" size={16} />
        </span>
      </span>
    </label>
  );
}

interface ChooseExperiencesProps {
  /** Seeds the control on a return visit. Verify's availability is release
   *  configuration and deliberately not a prop, so this screen cannot be
   *  talked into offering an experience that has not shipped. */
  buildSelected?: boolean;
  /** Receives the queued intent. Selecting a card does not call this. */
  onContinue: (intent: ExperienceIntent) => void;
  onSetUpLater: () => void;
}

/** Step one of onboarding. It holds one boolean and calls back; it downloads
 *  nothing, writes no config, and looks for no credential. Every side effect
 *  belongs to the caller, and only after the user presses a button. */
export function ChooseExperiences({
  buildSelected = true,
  onContinue,
  onSetUpLater,
}: ChooseExperiencesProps) {
  const [buildChecked, setBuildChecked] = useState(buildSelected);

  // Unchecking Build changes where the button goes, never whether it works.
  // `Open Studio` is a real destination (NeutralShell below), so the primary
  // action is never a dead end.
  const primaryLabel = buildChecked ? 'Continue with Build' : 'Open Studio';

  return (
    <section aria-labelledby="choose-experiences-heading" className="h-full overflow-y-auto">
      {/* Native titlebar carries the window controls; no HTML traffic lights. */}
      {/* `min-h-full`: the section is `h-full`, but this grid sized to its
          content, so the editorial column's `border-r` stopped partway down
          the window and left a divider hanging in open space. Measured at
          1440x900 against mockups/01-choose-experiences, where the divider
          runs the full height. */}
      <div className="mx-auto grid min-h-full w-full max-w-6xl grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <aside
          className={`${EDITORIAL_COLUMN_VISIBILITY} flex-col gap-10 border-r border-border px-10 py-10`}
        >
          <div className="flex items-center gap-3">
            <span className="text-copper">
              <BrandMark size={24} />
            </span>
            <span className="text-[20px] leading-[28px] font-semibold text-text">Effi</span>
            <span className="text-xs leading-[18px] tracking-[0.18em] text-muted uppercase">
              Studio
            </span>
          </div>

          <div>
            <h2 className="text-[38px] leading-[44px] font-semibold tracking-tight text-text">
              Your tools. Your flow.
            </h2>
            <p className="pt-4 text-[20px] leading-[28px] text-muted">
              A focused workspace for building and verifying software.
            </p>
          </div>

          <ol className="flex flex-col gap-4">
            {STEPS.map((step, i) => {
              const current = i === 0;
              return (
                <li key={step} className="flex items-center gap-4">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      current ? 'border-copper text-copper' : 'border-border text-muted'
                    }`}
                    aria-hidden="true"
                  >
                    {current && <span className="h-2 w-2 rounded-full bg-copper" />}
                  </span>
                  <span className="font-mono text-xs leading-[18px] text-muted">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={`text-sm leading-[21px] ${current ? 'text-text' : 'text-muted'}`}
                  >
                    {step}
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="px-10 py-10">
          <p className="text-xs leading-[18px] tracking-[0.12em] text-muted uppercase">
            Make it yours
          </p>

          <h1
            id="choose-experiences-heading"
            className="pt-4 text-[30px] leading-[36px] font-semibold tracking-tight text-text"
          >
            How will you use Effi?
          </h1>
          <p className="pt-2 text-sm leading-[21px] text-muted">
            Choose what you need. Add more later.
          </p>

          {/* Two independent checkboxes. There is deliberately no `Both`
              option: a three-way choice would imply Verify is installable. */}
          <div className="flex flex-col gap-4 pt-8">
            <ExperienceCard
              controlId="experience-build"
              title="Build"
              badge="Available"
              badgeTone="available"
              summary="Code with your agents. Run, preview, and ship."
              note="Agents · Terminal · Browser · Devices"
              icon={TERMINAL}
              checked={buildChecked}
              onChange={setBuildChecked}
            />

            <ExperienceCard
              controlId="experience-verify"
              title="Verify"
              badge="Coming soon"
              badgeTone="comingSoon"
              summary="Explore, test, and capture evidence."
              // No waitlist, no email capture, no queued install — the control
              // is disabled and the sentence is the whole story.
              note="Not available to install yet."
              icon={SHIELD}
              checked={false}
              disabled
            />
          </div>

          <div className="flex items-start gap-3 border-t border-border pt-6 text-muted">
            <span className="shrink-0 pt-0.5">
              <Icon path={INFO} size={16} />
            </span>
            <p className="text-sm leading-[21px]">
              Build and Verify share one app. Enable either or both when available.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-6">
            <button
              type="button"
              onClick={() => onContinue({ build: buildChecked })}
              className="flex items-center gap-2 rounded-lg bg-copper px-4 py-2.5 text-sm leading-[20px] font-semibold text-on-copper transition-colors duration-150 hover:bg-copper/90 focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none"
            >
              {primaryLabel}
              <span aria-hidden="true">→</span>
            </button>

            <button
              type="button"
              onClick={onSetUpLater}
              className="rounded-lg px-3 py-2.5 text-sm leading-[20px] text-muted underline underline-offset-4 transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none"
            >
              Set up later
            </button>
          </div>

          <p className="pt-6 text-xs leading-[18px] text-muted">
            Only selected tools are installed. No account required to choose your setup.
          </p>
        </div>
      </div>
    </section>
  );
}

interface NeutralShellProps {
  onSetUpBuild: () => void;
  /** Optional on purpose: the Verify entry must render whether or not there is
   *  anywhere to send the user, so it can never block this screen. */
  onOpenVerify?: () => void;
}

/** Where `Set up later` lands: Studio with no experience enabled, no provider
 *  configured, and nothing installed. It must render and be usable in exactly
 *  that state — that is the point of removing the global provider gate — so it
 *  reads no config and runs no detection. */
export function NeutralShell({ onSetUpBuild, onOpenVerify }: NeutralShellProps) {
  return (
    <section aria-labelledby="neutral-shell-heading" className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-10 py-10">
        <p className="text-xs leading-[18px] tracking-[0.12em] text-muted uppercase">Effi Studio</p>

        <h1
          id="neutral-shell-heading"
          className="pt-4 text-[30px] leading-[36px] font-semibold tracking-tight text-text"
        >
          Make this workspace yours.
        </h1>
        <p className="pt-2 text-sm leading-[21px] text-muted">
          Nothing is set up yet. Studio works without it — add an experience whenever you want one.
        </p>

        <div className="mt-8 flex flex-col gap-4">
          <div className="flex items-start gap-4 rounded-xl border border-border bg-surface p-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-raised text-copper">
              <Icon path={TERMINAL} size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm leading-[20px] font-semibold text-text">Build</h2>
              <p className="pt-2 text-sm leading-[21px] text-muted">
                Code with your agents. Run, preview, and ship.
              </p>
            </div>
            <button
              type="button"
              onClick={onSetUpBuild}
              className="shrink-0 rounded-lg bg-copper px-4 py-2.5 text-sm leading-[20px] font-semibold text-on-copper transition-colors duration-150 hover:bg-copper/90 focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none"
            >
              Set up Build
            </button>
          </div>

          {/* Visible but inert: a row of text, not a disabled button, so there
              is nothing here to press and nothing to wait on. */}
          <div className="flex items-start gap-4 rounded-xl border border-border bg-surface p-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-raised text-muted">
              <Icon path={SHIELD} size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm leading-[20px] font-semibold text-text">Verify</h2>
                <span className="rounded-lg border border-border px-2 py-0.5 text-xs leading-[18px] font-semibold tracking-[0.08em] text-muted uppercase">
                  Coming soon
                </span>
              </div>
              <p className="pt-2 text-sm leading-[21px] text-muted">
                Not available to install yet.
              </p>
            </div>
            {onOpenVerify && (
              <button
                type="button"
                onClick={onOpenVerify}
                className="shrink-0 rounded-lg px-3 py-2.5 text-sm leading-[20px] text-muted underline underline-offset-4 transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none"
              >
                Learn more
              </button>
            )}
          </div>
        </div>

        <p className="mt-8 border-t border-border pt-6 text-xs leading-[18px] tracking-[0.12em] text-muted uppercase">
          One app. Enable the experiences you need.
        </p>
      </div>
    </section>
  );
}
