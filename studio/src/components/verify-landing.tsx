/** Outline marks at the spec's 16–18px stroke weight. Inline because the app
 *  carries no icon dependency, and `currentColor` keeps every mark on the token
 *  that its container already set. */
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

const SHIELD = 'M12 3l7 3v6c0 4-3 6.5-7 9-4-2.5-7-5-7-9V6l7-3z M9 12l2 2 4-4';
const COMPASS = 'M12 3a9 9 0 110 18 9 9 0 010-18z M15.5 8.5l-2 5-5 2 2-5 5-2z';
const DOCUMENT = 'M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7l-4-4z M14 3v4h4 M9 13h6 M9 17h4';
const CHART = 'M5 20V4 M5 20h15 M9 17v-5 M13.5 17V8 M18 17v-8';

/** Named "planned" in the data as well as in the label: nothing here is a
 *  capability the app can be asked to perform, so each teaser renders as text
 *  and never as a control. A disabled button would still read as a thing to
 *  press. */
const PLANNED = [
  { title: 'Explore flows', detail: 'Investigate real user journeys.', icon: COMPASS },
  { title: 'Capture evidence', detail: 'Keep findings clear and reproducible.', icon: DOCUMENT },
  { title: 'Track quality', detail: 'Bring checks and outcomes together.', icon: CHART },
] as const;

interface VerifyLandingProps {
  /** Only names the way back. Verify's own availability is release
   *  configuration, never a prop, so this page cannot be talked into offering
   *  an experience that has not shipped. */
  buildEnabled: boolean;
  onBack: () => void;
  onManageExperiences: () => void;
}

/** The whole Verify surface, and purely informational: it holds no state,
 *  fetches nothing, and writes nothing. It is deliberately ignorant of
 *  sessions and projects — opening it is a navigation, so a live Build terminal
 *  must keep running behind it, which it cannot do if this component keys off
 *  or clears any session. */
export function VerifyLanding({ buildEnabled, onBack, onManageExperiences }: VerifyLandingProps) {
  const backLabel = buildEnabled ? 'Back to Build' : 'Back to Studio';

  return (
    <section aria-labelledby="verify-landing-heading" className="h-full overflow-y-auto">
      {/* Editorial measure, not a full-bleed dashboard. The page stays legible
          at the default 1180×760 and keeps its left edge at 1440×900. */}
      <div className="mx-auto w-full max-w-3xl px-10 py-10">
        <p className="text-xs leading-[18px] tracking-[0.12em] text-muted uppercase">
          Effi Studio / Verify
        </p>

        <div className="flex items-start gap-6 pt-6">
          <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-raised text-muted sm:flex">
            <Icon path={SHIELD} size={28} />
          </div>

          <div className="min-w-0">
            <h1
              id="verify-landing-heading"
              className="text-[38px] leading-[44px] font-semibold tracking-tight text-text"
            >
              Verify, coming soon.
            </h1>
            <p className="pt-4 text-[20px] leading-[28px] text-text">
              A focused space for testing, evidence, and release confidence.
            </p>
            <p className="pt-4 text-sm leading-[21px] text-muted">
              {buildEnabled
                ? 'Verify is not available yet. Your Build workspace stays ready.'
                : 'Verify is not available yet. Studio stays ready without it.'}
            </p>
          </div>
        </div>

        <hr className="my-8 border-t border-border" />

        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-0">
          {PLANNED.map((f, i) => (
            <li key={f.title} className={i > 0 ? 'sm:border-l sm:border-border sm:pl-6' : 'sm:pr-6'}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-raised text-copper">
                <Icon path={f.icon} />
              </div>
              <p className="pt-4 text-xs leading-[18px] tracking-[0.12em] text-muted uppercase">
                Planned
              </p>
              <h2 className="pt-1 text-sm leading-[20px] font-semibold text-text">{f.title}</h2>
              <p className="pt-2 text-sm leading-[21px] text-muted">{f.detail}</p>
            </li>
          ))}
        </ul>

        {/* The only two actions on the page, and both are navigation. Neither
            installs, enables, or queues anything. */}
        <div className="flex flex-wrap items-center gap-4 pt-8">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 rounded-lg bg-copper px-4 py-2.5 text-sm leading-[20px] font-semibold text-on-copper transition-colors duration-150 hover:bg-copper/90 focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none"
          >
            {backLabel}
            <span aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            onClick={onManageExperiences}
            className="rounded-lg px-3 py-2.5 text-sm leading-[20px] text-muted transition-colors duration-150 hover:bg-hover hover:text-text focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none"
          >
            Manage experiences
          </button>
        </div>

        <p className="mt-8 border-t border-border pt-6 text-xs leading-[18px] tracking-[0.12em] text-muted uppercase">
          One app. Enable the experiences you need.
        </p>
      </div>
    </section>
  );
}
