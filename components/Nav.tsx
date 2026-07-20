"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { isAdmin, Role } from "@/lib/auth/roles";

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { label: string; icon: string; items: NavItem[] };
type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

const NAV: NavEntry[] = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/spelers", label: "Spelers", icon: "👥" },
  {
    label: "Programma",
    icon: "📅",
    items: [
      { href: "/programma", label: "Speelprogramma", icon: "📅" },
      { href: "/wedstrijden", label: "Voorbereiding & verslag", icon: "📋" },
      { href: "/schema", label: "Was & rijden", icon: "🚗" },
    ],
  },
  { href: "/resultaten", label: "Resultaten", icon: "⚽" },
  {
    label: "Training",
    icon: "🎯",
    items: [
      { href: "/training", label: "Trainingsprogramma", icon: "🎯" },
      { href: "/belasting", label: "Belasting", icon: "❤️" },
    ],
  },
];

function isActiveHref(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function groupContainsActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((i) => isActiveHref(pathname, i.href));
}

export default function Nav({ role, loginActive }: { role: Role; loginActive: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Alleen expliciete gebruikersacties (klik op een groep) — automatisch openklappen
  // van de groep met de actieve pagina wordt hieronder puur uit `pathname` afgeleid,
  // zodat we geen state-in-effect nodig hebben.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const nav = isAdmin(role)
    ? [...NAV, { href: "/admin/gebruikers", label: "Gebruikers", icon: "🔑" }]
    : NAV;

  function isGroupOpen(group: NavGroup): boolean {
    return group.label in overrides ? overrides[group.label] : groupContainsActive(group, pathname);
  }

  function toggleGroup(group: NavGroup) {
    setOverrides((prev) => ({ ...prev, [group.label]: !isGroupOpen(group) }));
  }

  function renderItem(item: NavItem, indent = false) {
    const active = isActiveHref(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          indent ? "ml-3" : ""
        } ${active ? "bg-rose-600 text-white" : "text-neutral-300 hover:bg-neutral-800 hover:text-white"}`}
      >
        <span aria-hidden>{item.icon}</span>
        {item.label}
      </Link>
    );
  }

  function renderGroup(group: NavGroup) {
    const expanded = isGroupOpen(group);
    const active = groupContainsActive(group, pathname);
    return (
      <div key={group.label}>
        <button
          onClick={() => toggleGroup(group)}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            active && !expanded ? "text-white" : "text-neutral-300"
          } hover:bg-neutral-800 hover:text-white`}
        >
          <span aria-hidden>{group.icon}</span>
          <span className="flex-1 text-left">{group.label}</span>
          <span className={`text-xs transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden>
            ›
          </span>
        </button>
        {expanded && (
          <div className="mt-1 flex flex-col gap-1">{group.items.map((i) => renderItem(i, true))}</div>
        )}
      </div>
    );
  }

  const links = nav.map((entry) => (isGroup(entry) ? renderGroup(entry) : renderItem(entry)));

  const logoutButton = loginActive && (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
    >
      <span aria-hidden>🚪</span>
      Uitloggen
    </button>
  );

  return (
    <>
      {/* Mobiel: topbar */}
      <header className="md:hidden sticky top-0 z-20 flex items-center justify-between border-b-4 border-rose-600 bg-black px-4 py-3 text-white">
        <span className="font-bold">⚽ Teammanager</span>
        <button
          onClick={() => setOpen(!open)}
          aria-label="Menu"
          className="rounded-md border border-neutral-700 px-3 py-1"
        >
          ☰
        </button>
      </header>
      {open && (
        <nav className="md:hidden bg-black px-4 pb-4 flex flex-col gap-1">
          {links}
          {logoutButton}
        </nav>
      )}

      {/* Desktop: sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col gap-1 border-r-4 border-rose-600 bg-black p-4 min-h-screen sticky top-0">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold text-white">⚽ Teammanager</div>
          <div className="text-xs text-neutral-400">Sv Steenwijkerwold 19-1</div>
        </div>
        {links}
        {logoutButton && <div className="mt-2 border-t border-neutral-800 pt-2">{logoutButton}</div>}
      </aside>
    </>
  );
}
