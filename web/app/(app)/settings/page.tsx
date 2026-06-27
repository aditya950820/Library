"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, EmptyState } from "@/components/ui";
import type { UserRole } from "@/lib/types";

type Staff = {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
};

export default function SettingsPage() {
  const supabase = createClient();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    setMe(u.user?.id ?? null);
    const { data, error } = await supabase.rpc("list_staff");
    if (error) setError(error.message);
    setStaff((data as Staff[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function setRole(id: string, role: UserRole) {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) alert(error.message);
    else load();
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage staff access and roles"
      />

      {loading ? (
        <EmptyState title="Loading…" />
      ) : error ? (
        <EmptyState title="Access restricted" hint={error} />
      ) : (
        <div className="card divide-y">
          {staff.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="font-medium">
                  {s.email}
                  {s.id === me && <span className="ml-2 text-xs text-muted">(you)</span>}
                </div>
                <div className="text-xs text-muted">
                  Joined {new Date(s.created_at).toLocaleDateString()}
                </div>
              </div>
              <select
                className="input max-w-[10rem]"
                value={s.role}
                onChange={(e) => setRole(s.id, e.target.value as UserRole)}
              >
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 card p-5 text-sm text-muted">
        <p className="mb-1 font-medium text-[var(--foreground)]">About roles</p>
        <p>
          <strong>Managers</strong> can do everything, including managing staff and
          roles here. <strong>Admins</strong> can manage books, students and issues
          but cannot change staff access.
        </p>
        <p className="mt-2">
          New sign-ups are created as <strong>managers</strong> by default — change
          this above as needed, or adjust the default in your database trigger.
        </p>
      </div>
    </div>
  );
}
