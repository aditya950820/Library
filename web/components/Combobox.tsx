"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ComboItem = {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  keywords?: string;
};

export default function Combobox({
  items,
  onSearch,
  value,
  valueLabel,
  onChange,
  placeholder = "Type to search…",
  emptyText = "No matches",
}: {
  /** Static list — filtered in the browser. Ignored when onSearch is given. */
  items?: ComboItem[];
  /** Async server-side search. Receives the query, returns matching items. */
  onSearch?: (query: string) => Promise<ComboItem[]>;
  value: string;
  /** Label to show for the current value (needed in async mode). */
  valueLabel?: string;
  onChange: (item: ComboItem | null) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<ComboItem[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqRef = useRef(0);

  const isAsync = !!onSearch;

  // Local filtering for static mode.
  const localFiltered = useMemo(() => {
    if (isAsync) return [];
    const q = query.trim().toLowerCase();
    const list = items ?? [];
    if (!q) return list.slice(0, 50);
    return list
      .filter((i) =>
        `${i.label} ${i.sublabel ?? ""} ${i.keywords ?? ""}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 50);
  }, [items, query, isAsync]);

  const results = isAsync ? remote : localFiltered;

  // Debounced server search in async mode.
  useEffect(() => {
    if (!isAsync || !open) return;
    const q = query.trim();
    const id = ++reqRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await onSearch!(q);
      if (id === reqRef.current) {
        setRemote(r);
        setLoading(false);
        setActive(0);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, isAsync, onSearch]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const staticSelectedLabel = !isAsync
    ? (items ?? []).find((i) => i.value === value)?.label
    : undefined;
  const display = open ? query : valueLabel ?? staticSelectedLabel ?? "";

  function pick(item: ComboItem) {
    if (item.disabled) return;
    onChange(item);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        className="input"
        value={display}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (results[active]) pick(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {value && !open && (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted"
        >
          ✕
        </button>
      )}

      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-surface shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted">
              {isAsync && !query.trim() ? "Type to search…" : emptyText}
            </div>
          ) : (
            results.map((item, idx) => (
              <button
                type="button"
                key={item.value}
                disabled={item.disabled}
                onMouseEnter={() => setActive(idx)}
                onClick={() => pick(item)}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm"
                style={{
                  background: idx === active ? "var(--accent-soft)" : "transparent",
                  opacity: item.disabled ? 0.45 : 1,
                  cursor: item.disabled ? "not-allowed" : "pointer",
                }}
              >
                <span className="font-medium">{item.label}</span>
                {item.sublabel && (
                  <span className="text-xs text-muted">{item.sublabel}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
