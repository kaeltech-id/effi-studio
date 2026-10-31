import { useRef } from 'react';
import type { KeyboardEvent } from 'react';

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}

const ARROW_STEP: Record<string, number | undefined> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/** A tablist, so only the selected option is in the tab order and the arrows
 *  move between them -- a screen reader that hears "tab" expects that. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedProps<T>) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.id);
    tabs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = ARROW_STEP[event.key];
    if (step !== undefined) {
      event.preventDefault();
      select((index + step + options.length) % options.length);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      select(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      select(options.length - 1);
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex w-full gap-1 rounded-lg border border-border bg-surface p-1"
    >
      {options.map((option, index) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            ref={(el) => {
              tabs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm leading-[20px] font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:outline-none motion-reduce:transition-none ${
              selected ? 'bg-brand-blue text-text' : 'text-muted hover:bg-hover hover:text-text'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
