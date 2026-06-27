"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Modal, EmptyState, Field } from "@/components/ui";
import type { Student } from "@/lib/types";

type KV = { key: string; value: string };

export default function StudentsPage() {
  const supabase = createClient();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [extra, setExtra] = useState<KV[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("students")
      .select("*")
      .order("created_at", { ascending: false });
    setStudents((data as Student[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    return (
      !q ||
      s.student_name.toLowerCase().includes(q) ||
      s.id_number.toLowerCase().includes(q)
    );
  });

  function openNew() {
    setId(null);
    setName("");
    setIdNumber("");
    setExtra([]);
    setError(null);
    setEditOpen(true);
  }
  function openEdit(s: Student) {
    setId(s.student_id);
    setName(s.student_name);
    setIdNumber(s.id_number);
    setExtra(
      Object.entries(s.additional_details ?? {}).map(([key, value]) => ({
        key,
        value: String(value),
      }))
    );
    setError(null);
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const details: Record<string, string> = {};
    extra.forEach((kv) => {
      if (kv.key.trim()) details[kv.key.trim()] = kv.value;
    });
    const payload = {
      student_name: name.trim(),
      id_number: idNumber.trim(),
      additional_details: Object.keys(details).length ? details : null,
    };
    const res = id
      ? await supabase.from("students").update(payload).eq("student_id", id)
      : await supabase.from("students").insert(payload);
    if (res.error) {
      setError(res.error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEditOpen(false);
    load();
  }

  async function remove(s: Student) {
    if (!confirm(`Delete ${s.student_name}?`)) return;
    const { error } = await supabase
      .from("students")
      .delete()
      .eq("student_id", s.student_id);
    if (error) alert(error.message);
    else load();
  }

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle={`${students.length} registered`}
        action={
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => setBulkOpen(true)}>
              ↥ Bulk upload
            </button>
            <button className="btn btn-primary" onClick={openNew}>
              + Add student
            </button>
          </div>
        }
      />

      <div className="mb-4">
        <input
          className="input max-w-sm"
          placeholder="Search by name or ID number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <EmptyState title="Loading…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "No matching students" : "No students yet"}
          hint={search ? undefined : "Add a student or import in bulk."}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <div key={s.student_id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{s.student_name}</div>
                  <div className="text-sm text-muted">{s.id_number}</div>
                </div>
              </div>
              {s.additional_details &&
                Object.keys(s.additional_details).length > 0 && (
                  <dl className="mt-3 space-y-1 text-xs">
                    {Object.entries(s.additional_details).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt className="capitalize text-muted">{k}</dt>
                        <dd className="text-right">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              <div className="mt-3 flex gap-2">
                <button className="btn btn-ghost flex-1 py-1.5 text-xs" onClick={() => openEdit(s)}>
                  Edit
                </button>
                <button className="btn btn-danger flex-1 py-1.5 text-xs" onClick={() => remove(s)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={id ? "Edit student" : "Add student"}>
        <form onSubmit={save} className="flex flex-col gap-4">
          <Field label="Student name *">
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="ID number *">
            <input className="input" required value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          </Field>

          <div>
            <label className="label">Additional details</label>
            <div className="flex flex-col gap-2">
              {extra.map((kv, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="input"
                    placeholder="Field (e.g. class)"
                    value={kv.key}
                    onChange={(e) => {
                      const next = [...extra];
                      next[i] = { ...kv, key: e.target.value };
                      setExtra(next);
                    }}
                  />
                  <input
                    className="input"
                    placeholder="Value"
                    value={kv.value}
                    onChange={(e) => {
                      const next = [...extra];
                      next[i] = { ...kv, value: e.target.value };
                      setExtra(next);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost px-3"
                    onClick={() => setExtra(extra.filter((_, idx) => idx !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost self-start text-xs"
                onClick={() => setExtra([...extra, { key: "", value: "" }])}
              >
                + Add field
              </button>
            </div>
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

      <BulkUploadStudents open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={load} />
    </div>
  );
}

function BulkUploadStudents({
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
    const known = ["student_name", "name", "id_number", "id"];
    const payload = rows
      .filter((r) => (r.student_name || r.name) && (r.id_number || r.id))
      .map((r) => {
        const details: Record<string, string> = {};
        Object.entries(r).forEach(([k, v]) => {
          if (!known.includes(k) && v) details[k] = v;
        });
        return {
          student_name: (r.student_name || r.name)?.trim(),
          id_number: (r.id_number || r.id)?.trim(),
          additional_details: Object.keys(details).length ? details : null,
        };
      });

    if (payload.length === 0) {
      setError("No valid rows. Each row needs a name and an id_number.");
      setImporting(false);
      return;
    }
    const { error } = await supabase.from("students").insert(payload);
    if (error) setError(error.message);
    else {
      setResult(`Imported ${payload.length} student${payload.length === 1 ? "" : "s"}.`);
      setRows([]);
      onDone();
    }
    setImporting(false);
  }

  const valid = rows.filter((r) => (r.student_name || r.name) && (r.id_number || r.id)).length;

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Bulk upload students"
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-[var(--accent-soft)] p-3 text-xs text-muted">
          Upload a <strong>CSV</strong> with at least <code>student_name</code> and{" "}
          <code>id_number</code>. Any extra columns (class, section, phone…) are saved as
          additional details.{" "}
          <button type="button" className="underline" onClick={downloadStudentTemplate}>
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
          <div className="text-sm text-muted">
            {fileName} — {rows.length} rows,{" "}
            <span style={{ color: valid ? "var(--success)" : "var(--danger)" }}>{valid} valid</span>
          </div>
        )}

        {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
        {result && <p className="text-sm" style={{ color: "var(--success)" }}>{result}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => { reset(); onClose(); }}>
            Close
          </button>
          <button type="button" className="btn btn-primary" disabled={importing || valid === 0} onClick={importRows}>
            {importing ? "Importing…" : `Import ${valid}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function downloadStudentTemplate() {
  const csv =
    "student_name,id_number,class,section,phone\n" +
    "Asha Verma,STU-1024,10,B,9876543210\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "students_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}
