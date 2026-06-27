"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";

const nav = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/books", label: "Books", icon: "▭" },
  { href: "/students", label: "Students", icon: "◌" },
  { href: "/issues", label: "Issues", icon: "⇄" },
  { href: "/settings", label: "Settings", icon: "⚙", managerOnly: true },
];

export default function AppShell({
  children,
  email,
  role,
}: {
  children: React.ReactNode;
  email: string;
  role: UserRole;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const items = nav.filter((n) => !n.managerOnly || role === "manager");

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClick}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
            style={{
              background: active ? "var(--accent-soft)" : "transparent",
              color: active ? "var(--accent)" : "var(--foreground)",
              fontWeight: active ? 600 : 400,
            }}
          >
            <span className="w-4 text-center opacity-70">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 flex-col gap-6 border-r p-5 bg-surface">
        <Brand />
        <NavLinks />
        <div className="mt-auto">
          <Account email={email} role={role} onSignOut={signOut} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex flex-1 flex-col">
        <header className="md:hidden sticky top-0 z-20 flex items-center justify-between border-b bg-surface px-4 py-3">
          <Brand />
          <button
            aria-label="Menu"
            onClick={() => setOpen(true)}
            className="btn btn-ghost px-3 py-2"
          >
            ☰
          </button>
        </header>

        {/* Mobile drawer */}
        {open && (
          <div className="md:hidden fixed inset-0 z-30">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-64 bg-surface p-5 flex flex-col gap-6 shadow-xl">
              <div className="flex items-center justify-between">
                <Brand />
                <button
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="text-muted text-xl"
                >
                  ✕
                </button>
              </div>
              <NavLinks onClick={() => setOpen(false)} />
              <div className="mt-auto">
                <Account email={email} role={role} onSignOut={signOut} />
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg text-white text-sm"
        style={{ background: "var(--accent)" }}
      >
        ❖
      </span>
      <span className="font-semibold tracking-tight">Library</span>
    </Link>
  );
}

function Account({
  email,
  role,
  onSignOut,
}: {
  email: string;
  role: UserRole;
  onSignOut: () => void;
}) {
  return (
    <div className="card p-3 text-sm">
      <div className="truncate font-medium">{email}</div>
      <div className="mb-2 mt-0.5 capitalize text-xs text-muted">{role}</div>
      <button onClick={onSignOut} className="btn btn-ghost w-full py-1.5 text-xs">
        Sign out
      </button>
    </div>
  );
}
