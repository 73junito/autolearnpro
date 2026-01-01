const steps = [
  { title: "Enroll or assign courses", desc: "Role-based access for learners, instructors, and admins." },
  { title: "Complete modules & labs", desc: "Canvas-style modules with prerequisites and requirements." },
  { title: "Demonstrate competency", desc: "Assessments and evidence capture (photos, video, logs)." },
  { title: "Validate against standards", desc: "Map competencies to FWG / ASE / Perkins frameworks." },
  { title: "Report outcomes", desc: "Exportable reporting for audits, funding, and program improvement." },
];

export default function HowItWorks() {
  return (
    <section className="border-t bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-xl font-semibold text-slate-900">How it works</h2>
        <p className="mt-2 text-sm text-slate-600">
          A simple, auditable flow from training to validated competency.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-5">
          {steps.map((s, idx) => (
            <div key={s.title} className="rounded-2xl border bg-white p-5">
              <div className="text-xs font-semibold text-blue-700">Step {idx + 1}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{s.title}</div>
              <div className="mt-2 text-sm text-slate-600">{s.desc}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border bg-white p-6 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">Built for CTE, workforce, and DoD training pipelines</div>
          <div className="mt-2 text-slate-600">
            Designed to support program reviews, Perkins-aligned reporting, and standards-based competency validation.
          </div>
        </div>
      </div>
    </section>
  );
}
