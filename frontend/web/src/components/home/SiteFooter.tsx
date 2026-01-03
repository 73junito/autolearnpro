import React from 'react';
import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">AutoLearnPro</span> • Competency LMS
            <div className="mt-1 text-xs text-slate-500">© {new Date().getFullYear()}</div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="text-slate-600 hover:text-slate-900" href="/">
              Documentation
            </Link>
            <Link className="text-slate-600 hover:text-slate-900" href="/">
              Privacy
            </Link>
            <Link className="text-slate-600 hover:text-slate-900" href="/">
              Accessibility
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
