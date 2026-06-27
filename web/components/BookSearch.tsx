"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui";
import { searchBooks, type BookMeta } from "@/lib/isbn";

export default function BookSearch({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (book: BookMeta) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced live search
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 3) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const r = await searchBooks(query);
      setResults(r);
      setLoading(false);
      setSearched(true);
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSearched(false);
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Find book by title">
      <div className="flex flex-col gap-3">
        <input
          autoFocus
          className="input"
          placeholder="Type a book title or author…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {loading && <p className="text-sm text-muted">Searching…</p>}
        {!loading && searched && results.length === 0 && (
          <p className="text-sm text-muted">
            No matches. Try fewer or different words, or add the book manually.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {results.map((b, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(b)}
              className="card flex items-start gap-3 p-3 text-left hover:shadow-sm transition-shadow"
            >
              {b.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.cover}
                  alt=""
                  className="h-16 w-12 flex-shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-16 w-12 flex-shrink-0 items-center justify-center rounded bg-[var(--accent-soft)] text-muted">
                  ▭
                </div>
              )}
              <div className="min-w-0">
                <div className="font-medium leading-tight">{b.title}</div>
                <div className="text-sm text-muted">
                  {b.author || "Unknown author"}
                  {b.year ? ` · ${b.year}` : ""}
                </div>
                <div className="text-xs text-muted">
                  {b.publisher || ""}
                  {b.isbn ? `${b.publisher ? " · " : ""}ISBN ${b.isbn}` : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
