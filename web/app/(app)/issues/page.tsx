"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Modal, EmptyState, Field } from "@/components/ui";
import BarcodeScanner from "@/components/BarcodeScanner";
import Combobox, { type ComboItem } from "@/components/Combobox";
import { normalizeIsbn } from "@/lib/isbn";
import {
  MAX_BOOKS_PER_STUDENT,
  WARN_BOOKS_THRESHOLD,
  type BookIssueWithRefs,
} from "@/lib/types";

type Filter = "active" | "overdue" | "returned" | "all";

export default function IssuesPage() {
  const supabase = createClient();
  const [issues, setIssues] = useState<BookIssueWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("book_issues")
      .select(
        "*, books(name, author), students(student_name, id_number), issuer:profiles!book_issues_issued_by_fkey(email)"
      )
      .order("issued_at", { ascending: false })
      .limit(500);
    setIssues((data as BookIssueWithRefs[]) ?? []);
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
                    {i.issuer?.email ? ` · by ${i.issuer.email}` : ""}
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
        onDone={load}
      />
    </div>
  );
}

function IssueModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClient();
  const [book, setBook] = useState<ComboItem | null>(null);
  const [student, setStudent] = useState<ComboItem | null>(null);
  const [days, setDays] = useState(14);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState(0);

  const bookId = book?.value ?? "";
  const studentId = student?.value ?? "";
  const atMax = activeCount >= MAX_BOOKS_PER_STUDENT;

  // Fetch the student's live active-book count whenever they change.
  useEffect(() => {
    if (!studentId) {
      setActiveCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("book_issues")
        .select("*", { count: "exact", head: true })
        .eq("student_id", studentId)
        .eq("status", "issued");
      if (!cancelled) setActiveCount(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, supabase]);

  // Server-side search: books (available first, out-of-stock disabled).
  const searchBooksFn = useCallback(
    async (q: string): Promise<ComboItem[]> => {
      let query = supabase
        .from("books")
        .select("book_id, name, author, isbn, available_quantity")
        .order("name")
        .limit(25);
      const term = q.trim();
      if (term) {
        const safe = term.replace(/[,()]/g, " ");
        query = query.or(
          `name.ilike.%${safe}%,author.ilike.%${safe}%,isbn.ilike.%${safe}%`
        );
      } else {
        query = query.gt("available_quantity", 0);
      }
      const { data } = await query;
      return (data ?? []).map((b) => ({
        value: b.book_id,
        label: b.name,
        sublabel: `${b.author}${b.isbn ? ` · ${b.isbn}` : ""} · ${b.available_quantity} avail.`,
        disabled: b.available_quantity <= 0,
      }));
    },
    [supabase]
  );

  // Server-side search: students by name / ID / mobile.
  const searchStudentsFn = useCallback(
    async (q: string): Promise<ComboItem[]> => {
      let query = supabase
        .from("students")
        .select("student_id, student_name, id_number, mobile")
        .order("student_name")
        .limit(25);
      const term = q.trim();
      if (term) {
        const safe = term.replace(/[,()]/g, " ");
        query = query.or(
          `student_name.ilike.%${safe}%,id_number.ilike.%${safe}%,mobile.ilike.%${safe}%`
        );
      }
      const { data } = await query;
      return (data ?? []).map((s) => ({
        value: s.student_id,
        label: s.student_name,
        sublabel: `${s.id_number}${s.mobile ? ` · ${s.mobile}` : ""}`,
      }));
    },
    [supabase]
  );

  async function handleScan(code: string) {
    setScanOpen(false);
    const isbn = normalizeIsbn(code);
    const { data: match } = await supabase
      .from("books")
      .select("book_id, name, author, isbn, available_quantity")
      .eq("isbn", isbn)
      .limit(1)
      .maybeSingle();
    if (!match) {
      setBook(null);
      setScanMsg(`No book in the catalogue with ISBN ${isbn}. Add it first.`);
      return;
    }
    if (match.available_quantity <= 0) {
      setBook(null);
      setScanMsg(`"${match.name}" has no copies available right now.`);
      return;
    }
    setBook({ value: match.book_id, label: match.name });
    setScanMsg(`Selected "${match.name}" by ${match.author}.`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (activeCount >= MAX_BOOKS_PER_STUDENT) {
      setError(
        `This student already has ${activeCount} books out — ${MAX_BOOKS_PER_STUDENT} is the maximum. Return one before issuing another.`
      );
      return;
    }
    if (activeCount >= WARN_BOOKS_THRESHOLD) {
      const ok = window.confirm(
        `This student already has ${activeCount} book${activeCount === 1 ? "" : "s"} issued. Do you still want to issue another?`
      );
      if (!ok) return;
    }

    setSaving(true);
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
    setBook(null);
    setStudent(null);
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
          <Combobox
            onSearch={searchBooksFn}
            value={bookId}
            valueLabel={book?.label}
            onChange={(item) => {
              setBook(item);
              setScanMsg(null);
            }}
            placeholder="Search book by title, author or ISBN…"
            emptyText="No matching books"
          />
        </Field>

        <Field label="Student *">
          <Combobox
            onSearch={searchStudentsFn}
            value={studentId}
            valueLabel={student?.label}
            onChange={setStudent}
            placeholder="Search student by name, ID or mobile…"
            emptyText="No matching students"
          />
          {studentId && (
            <p
              className="mt-1 text-xs"
              style={{
                color: atMax
                  ? "var(--danger)"
                  : activeCount >= WARN_BOOKS_THRESHOLD
                    ? "var(--warning)"
                    : "var(--muted)",
              }}
            >
              {atMax
                ? `Has ${activeCount}/${MAX_BOOKS_PER_STUDENT} books — at the maximum. Return one first.`
                : `Currently holds ${activeCount}/${MAX_BOOKS_PER_STUDENT} book${activeCount === 1 ? "" : "s"}.` +
                  (activeCount >= WARN_BOOKS_THRESHOLD
                    ? " You'll be asked to confirm."
                    : "")}
            </p>
          )}
        </Field>

        <Field label="Issue for (days)">
          <input type="number" min={1} className="input" value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </Field>

        {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !bookId || !studentId || atMax}>
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
