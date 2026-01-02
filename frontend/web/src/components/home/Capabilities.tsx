import React from 'react';

const caps = [
  { title: "Competency-Based Learning", desc: "Progression based on mastery—not seat time." },
  { title: "Standards Alignment", desc: "Map competencies to FWG, ASE, Perkins, and custom frameworks." },
  { title: "Evidence-Based Labs", desc: "Collect photos, videos, logs, and assessment proof." },
  { title: "Canvas-Style Modules", desc: "Modules, prerequisites, and completion requirements." },
  { title: "Program Analytics", desc: "Track completions, mastery, and credential readiness." },
  { title: "Exportable Reporting", desc: "CSV/PDF-ready outputs for audits and funding documentation." },
];

export default function Capabilities() {
  return (
    <section className="border-y bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-xl font-semibold text-slate-900">Core capabilities</h2>
        <p className="mt-2 text-sm text-slate-600">
          Everything you need to deliver CTE and workforce training with validated outcomes.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {caps.map((c) => (
            <div key={c.title} className="rounded-2xl border bg-white p-5">
              <div className="text-base font-semibold text-slate-900">{c.title}</div>
              <div className="mt-2 text-sm text-slate-600">{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
