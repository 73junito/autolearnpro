import React from 'react';
import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur">
      {/* Accessible skip link */}
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center">
            <img src="/images/logo.png" alt="AutoLearnPro" className="h-10 w-10 rounded-xl object-cover" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">AutoLearnPro</div>
            <div className="text-xs text-slate-500">Competency LMS</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link className="text-sm text-slate-700 hover:text-slate-900" href="/courses">
            Browse Courses
          </Link>
          <Link className="text-sm text-slate-700 hover:text-slate-900" href="/dashboard">
            Dashboard
          </Link>
          <Link className="text-sm text-slate-700 hover:text-slate-900" href="/admin/dashboard">
            Admin
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Sign in
          </Link>
          <Link
            href="/courses"
            className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            Browse Catalog
          </Link>
        </div>
      </div>
    </header>
  );
}
