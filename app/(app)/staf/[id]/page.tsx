"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ageFromBirthdate, todayIso } from "@/lib/format";
import { staffAbsenceStatus } from "@/lib/absence";
import { AbsenceBanner } from "@/components/PlayerAbsence";
import { Card, Message, PageTitle, inputCls } from "@/components/ui";
import { Absence, StaffMember } from "@/lib/types";
import { useCanEdit } from "@/lib/auth/RoleProvider";

export default function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const canEdit = useCanEdit();
  const { id } = use(params);

  const [staffMember, setStaffMember] = useState<StaffMember | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [editingRole, setEditingRole] = useState(false);

  const reload = () =>
    Promise.all([api.list("staff"), api.list("absences")])
      .then(([staff, a]) => {
        const found = staff.find((s) => s.id === id) ?? null;
        if (!found) {
          setNotFound(true);
        } else {
          setStaffMember(found);
        }
        setAbsences(a);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function updateContact(value: string) {
    await api.update("staff", id, { contact: value || null });
    await reload();
    setMsg("Contactgegevens opgeslagen.");
    setErr(false);
  }

  async function updateRole(value: string) {
    await api.update("staff", id, { role: value || null });
    await reload();
    setEditingRole(false);
  }

  async function updateBirthdate(value: string) {
    await api.update("staff", id, { birthdate: value || null });
    await reload();
  }

  if (loading) return <p className="text-slate-500">Laden…</p>;
  if (notFound || !staffMember) {
    return (
      <div>
        <PageTitle title="Staflid niet gevonden" />
        <Link href="/spelers" className="text-sm text-rose-600 hover:underline">← Terug naar Spelers</Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/spelers" className="mb-2 inline-block text-sm text-rose-600 hover:underline">← Terug naar Spelers</Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{staffMember.name}</h1>
        {staffMember.birthdate && (
          <span className="text-sm text-slate-500">{ageFromBirthdate(staffMember.birthdate)} jaar · </span>
        )}
        {editingRole && canEdit ? (
          <input
            autoFocus
            className="mt-1 w-full max-w-sm rounded border border-rose-300 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            defaultValue={staffMember.role ?? ""}
            placeholder="Taak (bv. Coach, Trainer)"
            onBlur={(e) => (e.target.value !== (staffMember.role ?? "") ? updateRole(e.target.value) : setEditingRole(false))}
            onKeyDown={(e) => e.key === "Escape" && setEditingRole(false)}
          />
        ) : canEdit ? (
          <button
            onClick={() => setEditingRole(true)}
            className="mt-1 text-sm text-slate-500 hover:text-rose-600 hover:underline"
            title="Klik om te bewerken"
          >
            {staffMember.role || "Taak toevoegen"}
          </button>
        ) : (
          <span className="mt-1 text-sm text-slate-500">{staffMember.role}</span>
        )}
      </div>

      <AbsenceBanner status={staffAbsenceStatus(id, absences, todayIso())} />

      <Card>
        <h2 className="mb-3 font-semibold">Contactgegevens</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Contact</label>
            <input
              className={`${inputCls} w-full max-w-sm`}
              disabled={!canEdit}
              defaultValue={staffMember.contact ?? ""}
              placeholder="Telefoon of e-mail"
              onBlur={(e) => e.target.value !== (staffMember.contact ?? "") && updateContact(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Geboortedatum</label>
            <input
              type="date"
              disabled={!canEdit}
              className={inputCls}
              defaultValue={staffMember.birthdate ?? ""}
              onBlur={(e) => e.target.value !== (staffMember.birthdate ?? "") && updateBirthdate(e.target.value)}
            />
          </div>
        </div>
        <Message text={msg} error={err} />
      </Card>
    </div>
  );
}
