import { Check, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

export interface Opt<T extends string | number> {
  value: T;
  label: string;
  desc?: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

const idx = (i: number) => ({ "--i": i }) as CSSProperties;

/** Card-style options. Pass `multi` for checkboxes, otherwise it behaves like a radio group. */
export function OptionList<T extends string | number>({ options, selected, onPick, layout = "list", multi, label }: {
  options: Opt<T>[];
  selected: T[];
  onPick: (value: T) => void;
  layout?: "list" | "grid";
  multi?: boolean;
  label?: string;
}) {
  return (
    <div className={`opts${layout === "grid" ? " grid" : ""}${multi ? " multi" : ""} stagger`} role={multi ? "group" : "radiogroup"} aria-label={label}>
      {options.map((o, i) => {
        const on = selected.includes(o.value);
        const Icon = o.icon;
        return (
          <button
            key={String(o.value)}
            type="button"
            className={`opt${on ? " on" : ""}${Icon ? "" : " noico"}`}
            style={idx(i)}
            role={multi ? "checkbox" : "radio"}
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => onPick(o.value)}
          >
            {Icon && <span className="ico"><Icon /></span>}
            <span>
              <span className="t">{o.label}</span>
              {o.desc && <span className="d" style={{ display: "block" }}>{o.desc}</span>}
            </span>
            <span className="tick"><Check /></span>
          </button>
        );
      })}
    </div>
  );
}

/** Pill chips for short answers. */
export function ChipGroup<T extends string | number>({ options, selected, onPick, multi, label }: {
  options: Opt<T>[];
  selected: T[];
  onPick: (value: T) => void;
  multi?: boolean;
  label?: string;
}) {
  return (
    <div className="opts chips stagger" role={multi ? "group" : "radiogroup"} aria-label={label}>
      {options.map((o, i) => {
        const on = selected.includes(o.value);
        const Icon = o.icon;
        return (
          <button key={String(o.value)} type="button" className={`chip${on ? " on" : ""}`} style={idx(i)}
            role={multi ? "checkbox" : "radio"} aria-checked={on} disabled={o.disabled} onClick={() => onPick(o.value)}>
            {Icon && <Icon />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Toggle helper for multi-selects with an exclusive "none" value and an optional max. */
export function toggleIn<T>(list: T[], value: T, opts: { none?: T; max?: number } = {}): T[] {
  if (list.includes(value)) return list.filter((x) => x !== value);
  if (opts.none !== undefined && value === opts.none) return [value];
  let next = opts.none !== undefined ? list.filter((x) => x !== opts.none) : [...list];
  if (opts.max && next.length >= opts.max) next = next.slice(1);
  return [...next, value];
}
