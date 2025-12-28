import Link from "next/link";

const featured = [
  { code: "A5", title: "Brake Systems (ASE A5)", meta: "Intermediate • Virtual + Hands-on" },
  { code: "EP", title: "Engine Performance", meta: "Intermediate" },
  { code: "EV", title: "EV Battery Technology", meta: "Intro → Advanced track" },
  { code: "DE", title: "Diesel Emissions Control", meta: "Intermediate" },
  { code: "HV", title: "High-Voltage Systems Service", meta: "Intro • Safety-critical" },
  { code: "CP", title: "Capstone Project", meta: "Advanced • Evidence portfolio" },
];

export default function CoursePreview() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Explore the course catalog</h2>
            <p className="mt-2 text-sm text-slate-600">
              Preview a few courses. Open the full catalog to filter by track, level, or credential.
            </p>
          </div>
          <Link
            href="/catalog"
            className="hidden rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 md:inline-flex"
          >
            View full catalog
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((c) => (
            <div key={c.code} className="rounded-2xl border bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-xs font-semibold text-blue-700">
                  {c.code}
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  Catalog
                </span>
              </div>
              <div className="mt-3 text-sm font-semibold text-slate-900">{c.title}</div>
              <div className="mt-1 text-xs text-slate-500">{c.meta}</div>

              <div className="mt-4">
                <Link
                  href="/catalog"
                  className="inline-flex rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
                >
                  Open course
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 md:hidden">
          <Link
            href="/catalog"
            className="inline-flex rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            View full catalog
          </Link>
        </div>
      </div>
    </section>
  );
}
