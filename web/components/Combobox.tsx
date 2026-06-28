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
  value,
  onChange,
  placeholder = "Type to search…",
  emptyText = "No matches",
}: {
  items: ComboItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = items.find((i) => i.value === value) || null;

  // When closed, show the selected label in the input.
  const display = open ? query : selected?.label ?? "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items
      .filter((i) =>
        `${i.label} ${i.sublabel ?? ""} ${i.keywords ?? ""}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 50);
  }, [items, query]);

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

  function pick(item: ComboItem) {
    if (item.disabled) return;
    onChange(item.value);
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
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[active]) pick(filtered[active]);
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
            onChange("");
            setQuery("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted"
        >
          ✕
        </button>
      )}

      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-surface shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted">{emptyText}</div>
          ) : (
            filtered.map((item, idx) => (
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
