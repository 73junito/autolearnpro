import React from 'react';
import Link from "next/link";

const paths = [
  {
    title: "Learners",
    desc: "Complete modules, labs, and assessments. Track mastery and credentials.",
    href: "/catalog",
    bullets: ["Course cards", "Module progression", "Competency mastery"],
  },
  {
    title: "Instructors",
    desc: "Build modules, attach labs/quizzes, and map competencies to standards.",
    href: "/instructor",
    bullets: ["Modules & requirements", "Evidence-based labs", "Competency mapping"],
  },
  {
    title: "Program Administrators",
    desc: "Monitor outcomes and export reports aligned to Perkins and standards.",
    href: "/admin/dashboard",
    bullets: ["Program analytics", "Mappings import/export", "Audit-ready exports"],
  },
];

export default function RolePaths() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-xl font-semibold text-slate-900">Choose your path</h2>
        <p className="mt-2 text-sm text-slate-600">
          Role-based tools and dashboards tailored to work outcomes.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {paths.map((p) => (
            <div key={p.title} className="rounded-2xl border bg-white p-5">
              <div className="text-base font-semibold text-slate-900">{p.title}</div>
              <div className="mt-2 text-sm text-slate-600">{p.desc}</div>

              <ul className="mt-4 space-y-1 text-sm text-slate-700">
                {p.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-700" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                <Link
                  href={p.href}
                  className="inline-flex rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Open {p.title}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
