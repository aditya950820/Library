"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Modal, EmptyState, Field } from "@/components/ui";
import BarcodeScanner from "@/components/BarcodeScanner";
import BookSearch from "@/components/BookSearch";
import { lookupIsbn, normalizeIsbn, type BookMeta } from "@/lib/isbn";
import { TAXONOMY, CATEGORIES, matchCategory, aiClassify } from "@/lib/categories";
import type { Book } from "@/lib/types";

const EMPTY: Partial<Book> = {
  name: "",
  author: "",
  publisher: "",
  isbn: "",
  shelf_no: "",
  rack_no: "",
  category: "",
  sub_category: "",
  quantity: 1,
};

export default function BooksPage() {
  const supabase = createClient();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [form, setForm] = useState<Partial<Book>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("books")
      .select("*, adder:profiles!books_added_by_fkey(email)")
      .order("created_at", { ascending: false });
    setBooks((data as Book[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = books.filter((b) => {
    if (categoryFilter && b.category !== categoryFilter) return false;
    const q = search.toLowerCase();
    return (
      !q ||
      b.name.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      (b.isbn ?? "").toLowerCase().includes(q) ||
      (b.category ?? "").toLowerCase().includes(q)
    );
  });

  function openNew() {
    setForm(EMPTY);
    setError(null);
    setLookupMsg(null);
    setEditOpen(true);
  }
  function openEdit(b: Book) {
    setForm(b);
    setError(null);
    setLookupMsg(null);
    setEditOpen(true);
  }

  async function handleScan(code: string) {
    const isbn = normalizeIsbn(code);
    setScanOpen(false);
    // Make sure the form is open so the scanned data is visible.
    setEditOpen(true);
    setForm((f) => ({ ...f, isbn }));
    setLookupMsg("Looking up book details…");
    const found = await lookupIsbn(isbn);
    if (found && (found.title || found.author || found.publisher)) {
      const guess = matchCategory(found.category, found.title);
      setForm((f) => ({
        ...f,
        isbn,
        name: f.name || found.title || "",
        author: f.author || found.author || "",
        publisher: f.publisher || found.publisher || "",
        category: f.category || guess?.category || "",
        sub_category: f.sub_category || guess?.sub_category || "",
      }));
      setLookupMsg(
        guess
          ? `Details found. Category set to “${guess.category}”. Review and save.`
          : "Details found — review. Category will be auto-detected on save."
      );
    } else {
      setLookupMsg("ISBN captured. No online match — fill the details manually.");
    }
  }

  function handlePickFromSearch(b: BookMeta) {
    setSearchOpen(false);
    setEditOpen(true);
    const guess = matchCategory(b.category, b.title);
    setForm((f) => ({
      ...f,
      name: b.title || f.name || "",
      author: b.author || f.author || "",
      publisher: b.publisher || f.publisher || "",
      isbn: b.isbn || f.isbn || "",
      category: f.category || guess?.category || "",
      sub_category: f.sub_category || guess?.sub_category || "",
    }));
    setLookupMsg("Details filled from search — review and save.");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Auto-detect category/sub-category if left blank.
    let category = emptyToNull(form.category);
    let subCategory = emptyToNull(form.sub_category);
    if ((!category || !subCategory) && form.name?.trim()) {
      setLookupMsg("Auto-detecting category…");
      const local = matchCategory(form.category, form.name, form.author);
      const guess =
        local ??
        (await aiClassify({
          title: form.name.trim(),
          author: form.author?.trim(),
          hint: form.publisher?.trim(),
        }));
      if (guess) {
        category = category || guess.category;
        subCategory = subCategory || guess.sub_category;
      }
      setLookupMsg(null);
    }

    const payload = {
      name: form.name?.trim(),
      author: form.author?.trim(),
      publisher: emptyToNull(form.publisher),
      isbn: emptyToNull(form.isbn),
      shelf_no: emptyToNull(form.shelf_no),
      rack_no: emptyToNull(form.rack_no),
      category,
      sub_category: subCategory,
      quantity: Number(form.quantity) || 0,
    };

    let res;
    if (form.book_id) {
      // keep available in sync with delta of quantity
      const delta = payload.quantity - (booksById(form.book_id)?.quantity ?? 0);
      res = await supabase
        .from("books")
        .update({
          ...payload,
          available_quantity:
            (booksById(form.book_id)?.available_quantity ?? 0) + delta,
        })
        .eq("book_id", form.book_id);
    } else {
      res = await supabase
        .from("books")
        .insert({ ...payload, available_quantity: payload.quantity });
    }

    if (res.error) {
      setError(res.error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEditOpen(false);
    load();
  }

  function booksById(id: string) {
    return books.find((b) => b.book_id === id);
  }

  async function remove(b: Book) {
    if (!confirm(`Delete "${b.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("books").delete().eq("book_id", b.book_id);
    if (error) alert(error.message);
    else load();
  }

  return (
    <div>
      <PageHeader
        title="Books"
        subtitle={`${books.length} title${books.length === 1 ? "" : "s"} in catalogue`}
        action={
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => setBulkOpen(true)}>
              ↥ Bulk upload
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setForm(EMPTY);
                setError(null);
                setLookupMsg(null);
                setScanOpen(true);
              }}
            >
              ⬚ Scan
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setForm(EMPTY);
                setError(null);
                setLookupMsg(null);
                setSearchOpen(true);
              }}
            >
              🔍 Find
            </button>
            <button className="btn btn-primary" onClick={openNew}>
              + Add book
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="input max-w-sm"
          placeholder="Search by title, author, ISBN, category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input max-w-xs sm:w-56"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <EmptyState title="Loading…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "No matching books" : "No books yet"}
          hint={search ? "Try a different search." : "Add a book or import in bulk."}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted">
                  <Th>Title</Th>
                  <Th>Author</Th>
                  <Th>Category</Th>
                  <Th>Location</Th>
                  <Th>Avail.</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.book_id} className="border-b last:border-0">
                    <Td>
                      <div className="font-medium">{b.name}</div>
                      {b.isbn && <div className="text-xs text-muted">{b.isbn}</div>}
                      {b.adder?.email && (
                        <div className="text-xs text-muted">Added by {b.adder.email}</div>
                      )}
                    </Td>
                    <Td>{b.author}</Td>
                    <Td>
                      {b.category || "—"}
                      {b.sub_category ? ` · ${b.sub_category}` : ""}
                    </Td>
                    <Td>
                      {b.shelf_no || b.rack_no
                        ? `Shelf ${b.shelf_no || "—"} / Rack ${b.rack_no || "—"}`
                        : "—"}
                    </Td>
                    <Td>
                      <span className="badge" style={availStyle(b)}>
                        {b.available_quantity}/{b.quantity}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        <button className="btn btn-ghost py-1.5 text-xs" onClick={() => openEdit(b)}>
                          Edit
                        </button>
                        <button className="btn btn-danger py-1.5 text-xs" onClick={() => remove(b)}>
                          Delete
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((b) => (
              <div key={b.book_id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-sm text-muted">{b.author}</div>
                  </div>
                  <span className="badge" style={availStyle(b)}>
                    {b.available_quantity}/{b.quantity}
                  </span>
                </div>
                <div className="mt-2 text-xs text-muted">
                  {(b.category || "Uncategorised")}
                  {b.sub_category ? ` · ${b.sub_category}` : ""}
                  {b.isbn ? ` · ${b.isbn}` : ""}
                  {b.adder?.email ? ` · Added by ${b.adder.email}` : ""}
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-ghost flex-1 py-1.5 text-xs" onClick={() => openEdit(b)}>
                    Edit
                  </button>
                  <button className="btn btn-danger flex-1 py-1.5 text-xs" onClick={() => remove(b)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add / edit modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={form.book_id ? "Edit book" : "Add book"}
      >
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setScanOpen(true)}
            >
              ⬚ Scan ISBN
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSearchOpen(true)}
            >
              🔍 Find by title
            </button>
          </div>
          {lookupMsg && (
            <p className="-mt-1 text-xs" style={{ color: "var(--muted)" }}>
              {lookupMsg}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title *">
              <input className="input" required value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Author *">
              <input className="input" required value={form.author ?? ""} onChange={(e) => setForm({ ...form, author: e.target.value })} />
            </Field>
            <Field label="Publisher">
              <input className="input" value={form.publisher ?? ""} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
            </Field>
            <Field label="ISBN">
              <input className="input" value={form.isbn ?? ""} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
            </Field>
            <Field label="Category">
              <select
                className="input"
                value={form.category ?? ""}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value, sub_category: "" })
                }
              >
                <option value="">Select / auto-detect on save…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sub-category">
              <select
                className="input"
                value={form.sub_category ?? ""}
                disabled={!form.category || !TAXONOMY[form.category]}
                onChange={(e) => setForm({ ...form, sub_category: e.target.value })}
              >
                <option value="">
                  {form.category ? "Select…" : "Pick a category first"}
                </option>
                {form.category &&
                  TAXONOMY[form.category]?.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Shelf no.">
              <input className="input" value={form.shelf_no ?? ""} onChange={(e) => setForm({ ...form, shelf_no: e.target.value })} />
            </Field>
            <Field label="Rack no.">
              <input className="input" value={form.rack_no ?? ""} onChange={(e) => setForm({ ...form, rack_no: e.target.value })} />
            </Field>
            <Field label="Quantity">
              <input type="number" min={0} className="input" value={form.quantity ?? 0} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            </Field>
          </div>

          {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <BulkUpload open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={load} />

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetect={handleScan}
      />

      <BookSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handlePickFromSearch}
      />
    </div>
  );
}

function BulkUpload({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setRows([]);
    setFileName("");
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (res) => setRows(res.data),
      error: (err) => setError(err.message),
    });
  }

  async function importRows() {
    setImporting(true);
    setError(null);
    const payload = rows
      .filter((r) => (r.name || r.title) && r.author)
      .map((r) => {
        const qty = Number(r.quantity) || 1;
        let category = emptyToNull(r.category);
        let subCategory = emptyToNull(r.sub_category);
        // Fast, offline category guess when not provided in the CSV.
        if (!category) {
          const guess = matchCategory(r.category, r.name || r.title, r.author);
          if (guess) {
            category = guess.category;
            subCategory = subCategory || guess.sub_category;
          }
        }
        return {
          name: (r.name || r.title)?.trim(),
          author: r.author?.trim(),
          publisher: emptyToNull(r.publisher),
          isbn: emptyToNull(r.isbn),
          shelf_no: emptyToNull(r.shelf_no),
          rack_no: emptyToNull(r.rack_no),
          category,
          sub_category: subCategory,
          quantity: qty,
          available_quantity: qty,
        };
      });

    if (payload.length === 0) {
      setError("No valid rows found. Each row needs at least a name/title and author.");
      setImporting(false);
      return;
    }

    const { error } = await supabase.from("books").insert(payload);
    if (error) {
      setError(error.message);
    } else {
      setResult(`Imported ${payload.length} book${payload.length === 1 ? "" : "s"}.`);
      setRows([]);
      onDone();
    }
    setImporting(false);
  }

  const valid = rows.filter((r) => (r.name || r.title) && r.author).length;

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Bulk upload books"
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-[var(--accent-soft)] p-3 text-xs text-muted">
          Upload a <strong>CSV</strong> with columns:{" "}
          <code>name, author, publisher, isbn, shelf_no, rack_no, category, sub_category, quantity</code>.
          Only <strong>name</strong> and <strong>author</strong> are required.{" "}
          <button
            type="button"
            className="underline"
            onClick={downloadTemplate}
          >
            Download template
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="input"
        />

        {fileName && rows.length > 0 && (
          <div className="text-sm">
            <div className="mb-2 text-muted">
              {fileName} — {rows.length} row{rows.length === 1 ? "" : "s"},{" "}
              <span style={{ color: valid ? "var(--success)" : "var(--danger)" }}>
                {valid} valid
              </span>
            </div>
            <div className="card max-h-48 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted">
                    <Th>Name</Th>
                    <Th>Author</Th>
                    <Th>Qty</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <Td>{r.name || r.title || "—"}</Td>
                      <Td>{r.author || "—"}</Td>
                      <Td>{r.quantity || "1"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
        {result && <p className="text-sm" style={{ color: "var(--success)" }}>{result}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={importing || valid === 0}
            onClick={importRows}
          >
            {importing ? "Importing…" : `Import ${valid} book${valid === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function downloadTemplate() {
  const csv =
    "name,author,publisher,isbn,shelf_no,rack_no,category,sub_category,quantity\n" +
    "The Pragmatic Programmer,Andrew Hunt,Addison-Wesley,9780201616224,A1,R3,Technology,Software,2\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "books_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function emptyToNull(v: unknown) {
  const s = typeof v === "string" ? v.trim() : v;
  return s ? (s as string) : null;
}

function availStyle(b: Book): React.CSSProperties {
  const out = b.available_quantity <= 0;
  return out
    ? { background: "#f7ece9", color: "var(--danger)" }
    : { background: "var(--accent-soft)", color: "var(--accent)" };
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
