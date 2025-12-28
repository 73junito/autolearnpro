"use client"

import Link from 'next/link'

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-hero-gradient text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Program Dashboard</h1>
          <div className="flex gap-2">
            <Link href="/admin/theme-generator" className="btn-secondary">Theme</Link>
            <Link href="/admin/image-viewer" className="btn-primary">Images</Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-glass p-4 rounded-lg">
            <h3 className="font-semibold">Enrollment & Retention</h3>
            <div className="text-sm text-white/75 mt-2">Trends, filters by program and term.</div>
          </div>
          <div className="bg-glass p-4 rounded-lg">
            <h3 className="font-semibold">Completion & Credential Rates</h3>
            <div className="text-sm text-white/75 mt-2">Completion by course, ASE pass rates.</div>
          </div>
          <div className="bg-glass p-4 rounded-lg">
            <h3 className="font-semibold">Competency Mastery Heatmap</h3>
            <div className="text-sm text-white/75 mt-2">See gaps by standard and cohort.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-glass p-4 rounded-lg">
            <h3 className="font-semibold">Evidence Queue</h3>
            <div className="text-sm text-white/75 mt-2">Pending instructor reviews: photos, videos, logs.</div>
            <div className="mt-3 flex gap-2">
              <button className="btn-primary">Review batch</button>
              <button className="btn-secondary">Export CSV</button>
            </div>
          </div>

          <div className="bg-glass p-4 rounded-lg">
            <h3 className="font-semibold">Standards & Mappings</h3>
            <div className="text-sm text-white/75 mt-2">Map competencies to ASE / NATEF / FWG 5803.</div>
            <div className="mt-3">
              <button className="btn-primary">Open mapping editor</button>
            </div>
          </div>
        </div>

        <div className="mt-6 bg-glass p-4 rounded-lg">
          <h3 className="font-semibold">Audit & Activity Log</h3>
          <div className="text-sm text-white/75 mt-2">Immutable timestamped events for assessments and exports.</div>
        </div>
      </div>
    </div>
  )
}
