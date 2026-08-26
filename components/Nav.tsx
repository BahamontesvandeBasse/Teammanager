"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { isAdmin, Role } from "@/lib/auth/roles";

type NavItem = { href: string; label: string; icon: string; hideForSpeler?: boolean };

// Bovenaan staat alles wat spelers moeten zien (Spelers, Programma,
// Resultaten, Spelhervattingen); daarna de staf-georiënteerde pagina's.
// Geen samengevoegde/inklapbare groepen meer — één platte lijst.
// Wedstrijdvoorbereiding en Belasting zijn voor spelers verborgen: die zien
// opstelling/coachopmerkingen al via Resultaten (na de wedstrijd) en hun eigen
// belasting via hun spelersprofiel — de rest is niet voor hen bedoeld.
const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/spelers", label: "Spelers", icon: "👥" },
  { href: "/programma", label: "Programma", icon: "📅" },
  { href: "/resultaten", label: "Resultaten", icon: "⚽" },
  { href: "/spelhervattingen", label: "Spelhervattingen", icon: "🚩" },
  { href: "/wedstrijden", label: "Wedstrijdvoorbereiding", icon: "📋", hideForSpeler: true },
  { href: "/schema", label: "Was & rijden", icon: "🚗" },
  { href: "/training", label: "Trainingsprogramma", icon: "🎯", hideForSpeler: true },
  { href: "/belasting", label: "Belasting", icon: "❤️", hideForSpeler: true },
];

function isActiveHref(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function Nav({ role, loginActive }: { role: Role; loginActive: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const visible = role === "speler" ? NAV.filter((item) => !item.hideForSpeler) : NAV;
  const nav = isAdmin(role) ? [...visible, { href: "/admin/gebruikers", label: "Gebruikers", icon: "🔑" }] : visible;

  function renderItem(item: NavItem) {
    const active = isActiveHref(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active ? "bg-rose-600 text-white" : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
        }`}
      >
        <span aria-hidden>{item.icon}</span>
        {item.label}
      </Link>
    );
  }

  const links = nav.map(renderItem);

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
