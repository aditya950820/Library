"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Modal, EmptyState, Field } from "@/components/ui";
import BarcodeScanner from "@/components/BarcodeScanner";
import { normalizeIsbn } from "@/lib/isbn";
import type { Book, Student, BookIssueWithRefs } from "@/lib/types";

type Filter = "active" | "overdue" | "returned" | "all";

export default function IssuesPage() {
  const supabase = createClient();
  const [issues, setIssues] = useState<BookIssueWithRefs[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [iss, bk, st] = await Promise.all([
      supabase
        .from("book_issues")
        .select("*, books(name, author), students(student_name, id_number)")
        .order("issued_at", { ascending: false }),
      supabase.from("books").select("*").order("name"),
      supabase.from("students").select("*").order("student_name"),
    ]);
    setIssues((iss.data as BookIssueWithRefs[]) ?? []);
    setBooks((bk.data as Book[]) ?? []);
    setStudents((st.data as Student[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const now = Date.now();
  const isOverdue = (i: BookIssueWithRefs) =>
    i.status === "issued" && new Date(i.due_date).getTime() < now;

  const filtered = useMemo(() => {
    return issues.filter((i) => {
      if (filter === "active" && i.status !== "issued") return false;
      if (filter === "overdue" && !isOverdue(i)) return false;
      if (filter === "returned" && i.status !== "returned") return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        (i.books?.name ?? "").toLowerCase().includes(q) ||
        (i.students?.student_name ?? "").toLowerCase().includes(q) ||
        (i.students?.id_number ?? "").toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, filter, search]);

  async function returnBook(issueId: string) {
    const finePerDayRaw = prompt(
      "Fine per overdue day (leave 0 if none):",
      "0"
    );
    if (finePerDayRaw === null) return;
    const finePerDay = Number(finePerDayRaw) || 0;
    const { error } = await supabase.rpc("return_book", {
      p_issue_id: issueId,
      p_fine_per_day: finePerDay,
    });
    if (error) alert(error.message);
    else load();
  }

  const counts = {
    active: issues.filter((i) => i.status === "issued").length,
    overdue: issues.filter(isOverdue).length,
    returned: issues.filter((i) => i.status === "returned").length,
    all: issues.length,
  };

  return (
    <div>
      <PageHeader
        title="Issues"
        subtitle="Track issued, overdue and returned books"
        action={
          <button className="btn btn-primary" onClick={() => setIssueOpen(true)}>
            + Issue a book
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["active", "overdue", "returned", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="badge capitalize"
            style={
              filter === f
                ? { background: "var(--accent)", color: "#fff" }
                : { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }
            }
          >
            {f} · {counts[f]}
          </button>
        ))}
        <input
          className="input ml-auto max-w-xs"
          placeholder="Search book or student…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <EmptyState title="Loading…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nothing here" hint="No issues match this view." />
      ) : (
        <div className="grid gap-3">
          {filtered.map((i) => {
            const overdue = isOverdue(i);
            return (
              <div key={i.issue_id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-medium">{i.books?.name ?? "Unknown book"}</div>
                  <div className="text-sm text-muted">
                    {i.students?.student_name ?? "Unknown"} · {i.students?.id_number ?? ""}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Issued {fmt(i.issued_at)} · Due {fmt(i.due_date)}
                    {i.returned_at ? ` · Returned ${fmt(i.returned_at)}` : ""}
                    {i.fine_amount > 0 ? ` · Fine ₹${i.fine_amount}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={i.status} overdue={overdue} />
                  {i.status === "issued" && (
                    <button className="btn btn-ghost py-1.5 text-xs" onClick={() => returnBook(i.issue_id)}>
                      Return
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <IssueModal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        books={books}
        students={students}
        onDone={load}
      />
    </div>
  );
}

function IssueModal({
  open,
  onClose,
  books,
  students,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  books: Book[];
  students: Student[];
  onDone: () => void;
}) {
  const supabase = createClient();
  const [bookId, setBookId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [days, setDays] = useState(14);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const availableBooks = books.filter((b) => b.available_quantity > 0);

  function handleScan(code: string) {
    setScanOpen(false);
    const isbn = normalizeIsbn(code);
    const match = books.find((b) => b.isbn && normalizeIsbn(b.isbn) === isbn);
    if (!match) {
      setBookId("");
      setScanMsg(`No book in the catalogue with ISBN ${isbn}. Add it first.`);
      return;
    }
    if (match.available_quantity <= 0) {
      setBookId("");
      setScanMsg(`"${match.name}" has no copies available right now.`);
      return;
    }
    setBookId(match.book_id);
    setScanMsg(`Selected "${match.name}" by ${match.author}.`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc("issue_book", {
      p_book_id: bookId,
      p_student_id: studentId,
      p_issued_for: days,
    });
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setBookId("");
    setStudentId("");
    setDays(14);
    setScanMsg(null);
    onClose();
    onDone();
  }

  return (
    <Modal open={open} onClose={onClose} title="Issue a book">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={() => setScanOpen(true)}
        >
          ⬚ Scan book ISBN with camera
        </button>
        {scanMsg && (
          <p
            className="-mt-1 text-xs"
            style={{ color: bookId ? "var(--success)" : "var(--danger)" }}
          >
            {scanMsg}
          </p>
        )}

        <Field label="Book *">
          <select className="input" required value={bookId} onChange={(e) => setBookId(e.target.value)}>
            <option value="">Select a book…</option>
            {availableBooks.map((b) => (
              <option key={b.book_id} value={b.book_id}>
                {b.name} — {b.author} ({b.available_quantity} avail.)
              </option>
            ))}
          </select>
          {availableBooks.length === 0 && (
            <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
              No books with available copies.
            </p>
          )}
        </Field>

        <Field label="Student *">
          <select className="input" required value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select a student…</option>
            {students.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {s.student_name} — {s.id_number}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Issue for (days)">
          <input type="number" min={1} className="input" value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </Field>

        {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !bookId || !studentId}>
            {saving ? "Issuing…" : "Issue book"}
          </button>
        </div>
      </form>

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetect={handleScan}
      />
    </Modal>
  );
}

function StatusBadge({ status, overdue }: { status: string; overdue: boolean }) {
  if (overdue)
    return <span className="badge" style={{ background: "#f7ece9", color: "var(--danger)" }}>Overdue</span>;
  if (status === "returned")
    return <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--muted)" }}>Returned</span>;
  return <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>Issued</span>;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
