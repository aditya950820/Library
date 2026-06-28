export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-7 w-40 rounded bg-[var(--accent-soft)]" />
      <div className="mb-4 h-10 w-64 rounded-lg bg-[var(--accent-soft)]" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-[var(--accent-soft)]" />
        ))}
      </div>
    </div>
  );
}
