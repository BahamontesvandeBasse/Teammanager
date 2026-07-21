"use client";

import { ReactNode } from "react";

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const styles = {
    primary: "bg-rose-600 text-white hover:bg-rose-700",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  color = "slate",
}: {
  children: ReactNode;
  color?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const styles = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-800",
  }[color];
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}

export function Message({ text, error }: { text: string | null; error?: boolean }) {
  if (!text) return null;
  return (
    <div
      className={`mt-3 rounded-lg px-3 py-2 text-sm ${
        error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"
      }`}
    >
      {text}
    </div>
  );
}

// text-base (16px) i.p.v. text-sm: voorkomt dat iOS Safari inzoomt bij het
// focussen van een invoerveld met een kleiner lettertype, en is beter leesbaar.
export const inputCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 bg-white";

export const thCls = "px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600";
export const tdCls = "px-3 py-2 text-sm";
