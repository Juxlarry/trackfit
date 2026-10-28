import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Modal sheet: slides up from the bottom on phones, centred on wider screens.
 * Escape and a backdrop click close it; focus moves into it on open.
 */
export function Sheet({ open, onClose, children, wide, label }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  label: string;
}) {
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => {
    setClosing(true);
    window.setTimeout(() => { setClosing(false); onClose(); }, 200);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      const target = ref.current?.querySelector<HTMLElement>("input, button:not(.sheet-x)");
      target?.focus({ preventScroll: true });
    }, 60);
    return () => { document.removeEventListener("keydown", onKey); window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className={`sheet-back sb-lg${closing ? " closing" : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={ref} className={`sheet lg${wide ? " xl" : ""}`} role="dialog" aria-modal="true" aria-label={label}>
        <button type="button" className="sheet-x" aria-label="Close" onClick={close}><X /></button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
