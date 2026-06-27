import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

async function getStats() {
  const supabase = await createClient();
  const [books, students, issued, overdue] = await Promise.all([
    supabase.from("books").select("*", { count: "exact", head: true }),
    supabase.from("students").select("*", { count: "exact", head: true }),
    supabase
      .from("book_issues")
      .select("*", { count: "exact", head: true })
      .eq("status", "issued"),
    supabase
      .from("book_issues")
      .select("*", { count: "exact", head: true })
      .eq("status", "issued")
      .lt("due_date", new Date().toISOString()),
  ]);
  return {
    books: books.count ?? 0,
    students: students.count ?? 0,
    issued: issued.count ?? 0,
    overdue: overdue.count ?? 0,
  };
}

export default async function Dashboard() {
  const stats = await getStats();

  const cards = [
    { label: "Total books", value: stats.books, href: "/books" },
    { label: "Students", value: stats.students, href: "/students" },
    { label: "Books issued", value: stats.issued, href: "/issues" },
    {
      label: "Overdue",
      value: stats.overdue,
      href: "/issues",
      danger: stats.overdue > 0,
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-0.5 text-sm text-muted">
          A quick look at your library today.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-5 hover:shadow-sm transition-shadow">
            <div className="text-sm text-muted">{c.label}</div>
            <div
              className="mt-2 text-3xl font-semibold tracking-tight"
              style={{ color: c.danger ? "var(--danger)" : "var(--foreground)" }}
            >
              {c.value}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href="/books" className="card flex items-center justify-between p-5 hover:shadow-sm transition-shadow">
          <div>
            <div className="font-medium">Add or import books</div>
            <div className="text-sm text-muted">Single entry or bulk CSV upload</div>
          </div>
          <span className="text-2xl text-muted">→</span>
        </Link>
        <Link href="/issues" className="card flex items-center justify-between p-5 hover:shadow-sm transition-shadow">
          <div>
            <div className="font-medium">Issue a book</div>
            <div className="text-sm text-muted">Assign a book to a student</div>
          </div>
          <span className="text-2xl text-muted">→</span>
        </Link>
      </div>
    </div>
  );
}
