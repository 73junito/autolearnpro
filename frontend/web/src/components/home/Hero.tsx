import Link from "next/link";

export default function Hero() {
  return (
    <section className="border-b bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-12 md:grid-cols-2 md:py-16">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            Built for CTE • Workforce • DoD pipelines
          </p>

          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            Train Technicians. Validate Skills. Certify Competency.
          </h1>

          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Competency-based automotive, diesel, and EV training aligned to industry and federal standards,
            with Canvas-style modules and evidence-based labs.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/catalog"
              className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800"
            >
              Browse Course Catalog
            </Link>
            <Link
              href="/catalog?demo=1"
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              View Demo Course
            </Link>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border bg-white p-4">
              <dt className="text-slate-500">Standards mapping</dt>
              <dd className="mt-1 font-medium text-slate-900">FWG • ASE • Perkins</dd>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <dt className="text-slate-500">Evidence-based labs</dt>
              <dd className="mt-1 font-medium text-slate-900">Photos • Video • Logs</dd>
            </div>
          </dl>
        </div>

        {/* Visual placeholder - swap with screenshot later */}
        <div className="rounded-2xl border bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">Course Catalog Preview</div>
            <div className="text-xs text-slate-500">Canvas-style cards</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { code: "A5", title: "Brake Systems", meta: "Intermediate • ASE A5" },
              { code: "EP", title: "Engine Performance", meta: "Intermediate" },
              { code: "EV", title: "EV Fundamentals", meta: "Intro" },
              { code: "DE", title: "Diesel Engine Operation", meta: "Intro" },
            ].map((c) => (
              <div key={c.code} className="rounded-xl border bg-white p-3">
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold text-blue-700">
                    {c.code}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                    Module-ready
                  </span>
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">{c.title}</div>
                <div className="mt-1 text-xs text-slate-500">{c.meta}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border bg-white p-3 text-xs text-slate-600">
            Replace this panel with a screenshot of your real catalog or course home once you like the layout.
          </div>
        </div>
      </div>
    </section>
  );
}
