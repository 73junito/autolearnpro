"use client"

import { useEffect, useState } from 'react'

type MapRow = {
  id: string
  competency: { id: string; code: string; title: string }
  standard: { id: string; source: string; code: string; title: string }
  strength?: number
}

export default function MappingsPage() {
  const [rows, setRows] = useState<MapRow[]>([])
  const [page, setPage] = useState(1)
  const [limit] = useState(25)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSource, setEditSource] = useState('')
  const [editCode, setEditCode] = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])

  useEffect(() => { fetchRows() }, [page, limit, search, sourceFilter])

  async function fetchRows() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      if (search) params.set('search', search)
      if (sourceFilter) params.set('standardCode', sourceFilter)

      const res = await fetch(`/api/mappings?${params.toString()}`)
      const payload = await res.json()
      if (payload?.data) {
        setRows(payload.data)
        setTotal(payload.meta?.total || 0)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this mapping?')) return
    await fetch(`/api/mappings/${id}`, { method: 'DELETE' })
    setRows(r => r.filter(x => x.id !== id))
  }

  function startEdit(row: MapRow) {
    setEditingId(row.id)
    setEditSource(row.standard?.source || '')
    setEditCode(row.standard?.code || '')
    setSuggestions([])
  }

  async function saveEdit(id: string) {
    try {
      const body = { standardSource: editSource, standardCode: editCode }
      const res = await fetch(`/api/mappings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await res.json()
      if (payload?.error) {
        alert('Error: ' + payload.error)
        return
      }
      // refresh rows
      fetchRows()
      setEditingId(null)
    } catch (e) {
      console.error(e)
    }
  }

  async function suggestStandards(q: string) {
    if (!q) { setSuggestions([]); return }
    try {
      const res = await fetch(`/api/standards?search=${encodeURIComponent(q)}&limit=10`)
      const payload = await res.json()
      setSuggestions(payload.data || [])
    } catch (e) {
      console.error(e)
    }
  }

  // import modal state
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [importMode, setImportMode] = useState<'upsert'|'skip'|'overwrite'>('upsert')
  const [importReport, setImportReport] = useState<any | null>(null)
  const [errorCsvUrl, setErrorCsvUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [maintenanceKey, setMaintenanceKey] = useState<string | null>(null)
  const [maintenanceRunning, setMaintenanceRunning] = useState(false)
  const [maintenanceResult, setMaintenanceResult] = useState<any | null>(null)
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null)

  async function handleImportPreview() {
    try {
      // try parse JSON
      let items: any[] = []
      try { items = JSON.parse(importText) } catch (e) {
        // assume CSV — call server import as preview by not applying
        const res = await fetch(`/api/mappings/import?preview=true&mode=${importMode}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: importText })
        const payload = await res.json()
        setImportPreview(payload)
        return
      }
      setImportPreview(items)
    } catch (e) { console.error(e) }
  }

  async function applyImport() {
    try {
      let res
      if (importText.trim().startsWith('[')) {
        res = await fetch(`/api/mappings/import?mode=${importMode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: importText })
      } else {
        res = await fetch(`/api/mappings/import?mode=${importMode}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: importText })
      }
      const payload = await res.json()
      if (payload.error) alert('Import error: ' + payload.error)
      else {
        // payload may include { data: report, errorCsvUrl }
        setImportReport(payload.data || payload)
        setErrorCsvUrl(payload.errorCsvUrl || null)
        if (payload.data?.errors && payload.data.errors.length > 0) {
          // show a small notification
          // keep import modal cleared
        } else {
          // success
        }
        alert('Import complete — see summary below')
        setImportText('')
        setImportPreview([])
        fetchRows()
      }
    } catch (e) { console.error(e) }
  }

  async function copyErrorSummary() {
    try {
      if (!importReport || !importReport.errors) return
      const text = JSON.stringify(importReport.errors.slice(0, 100), null, 2)
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error(e)
      alert('Copy failed')
    }
  }

  async function runMaintenance() {
    try {
      setMaintenanceRunning(true)
      setMaintenanceResult(null)
      setMaintenanceError(null)
      const res = await fetch('/api/maintenance/cleanup-import-errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-maintenance-key': maintenanceKey || ''
        }
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        setMaintenanceError(payload?.error || `Request failed: ${res.status}`)
        return
      }
      const report = await res.json()
      setMaintenanceResult(report)
    } catch (e: any) {
      setMaintenanceError(String(e))
    } finally {
      setMaintenanceRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-hero-gradient text-white p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-6">
        <aside className="col-span-3 bg-glass p-4 rounded-lg">
          <h2 className="font-semibold mb-3">Filters</h2>
          <input placeholder="Search competency or standard" value={search} onChange={e => setSearch(e.target.value)} className="w-full p-2 rounded bg-white/5 mb-3" />
          <label className="text-sm text-white/75">Standard Source</label>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="w-full p-2 rounded bg-white/5 mb-3">
            <option value="">Any</option>
            <option value="FWG">FWG</option>
            <option value="ASE">ASE</option>
            <option value="NATEF">NATEF</option>
            <option value="PERKINS">PERKINS</option>
          </select>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">Import / Export</h3>
            <div className="flex gap-2 mb-2">
              <button className="btn-primary w-full" onClick={() => { const url = '/api/mappings/export'; window.open(url, '_blank') }}>Export CSV</button>
            </div>
            <label className="text-sm text-white/75">Conflict Mode</label>
            <select value={importMode} onChange={e => setImportMode(e.target.value as any)} className="w-full p-2 rounded bg-white/5 mb-2">
              <option value="upsert">Upsert (default)</option>
              <option value="skip">Skip existing</option>
              <option value="overwrite">Overwrite existing</option>
            </select>
            <textarea rows={6} placeholder='Paste JSON array or CSV here for import preview' value={importText} onChange={e => setImportText(e.target.value)} className="w-full p-2 rounded bg-white/5 mb-2" />
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={handleImportPreview}>Preview</button>
              <button className="btn-primary" onClick={applyImport}>Apply Import</button>
            </div>
            {importPreview.length > 0 && <div className="mt-3 text-sm text-white/75">Preview: {importPreview.length} rows</div>}
            {importReport && (
              <div className="mt-3 text-sm text-white/75">
                <div>Created Competencies: {importReport.createdCompetencies}</div>
                <div>Created Standards: {importReport.createdStandards}</div>
                <div>Created Mappings: {importReport.createdMappings}</div>
                <div>Updated Competencies: {importReport.updatedCompetencies}</div>
                <div>Updated Mappings: {importReport.updatedMappings}</div>
                <div>Skipped: {importReport.skipped}</div>
                <div>Errors: {importReport.errors?.length || 0}</div>
                {/* Callout / Download button */}
                {importReport.errors && importReport.errors.length > 0 ? (
                  <div className="mt-3 p-3 bg-yellow-600/20 rounded">
                    <div className="font-semibold text-yellow-200">Import completed with errors</div>
                    <div className="mt-2 flex gap-2">
                      {errorCsvUrl && (
                        <a href={errorCsvUrl} target="_blank" rel="noreferrer" className="btn-primary">Download error CSV</a>
                      )}
                      <button className="btn-secondary" onClick={copyErrorSummary}>{copied ? 'Copied' : 'Copy error summary'}</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 p-3 bg-green-700/20 rounded text-green-200">Import completed successfully</div>
                )}

                {/* Error preview table (first 20) */}
                {importReport.errors && importReport.errors.length > 0 && (
                  <div className="mt-3 overflow-auto max-h-64 bg-white/5 rounded p-2 text-sm text-white/90">
                    <div className="font-semibold mb-2">Error preview (first {Math.min(20, importReport.errors.length)})</div>
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-white/75">
                          <th className="p-1">Row</th>
                          <th className="p-1">Competency</th>
                          <th className="p-1">Standard Source</th>
                          <th className="p-1">Standard Code</th>
                          <th className="p-1">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importReport.errors.slice(0, 20).map((e: any, idx: number) => {
                          const orig = e.original || {}
                          const errMsg = String(e.message || '')
                          const short = errMsg.length > 80 ? errMsg.slice(0, 80) + '…' : errMsg
                          return (
                            <tr key={idx} className="border-t border-white/5">
                              <td className="p-1 align-top">{e.row}</td>
                              <td className="p-1 align-top">{orig.CompetencyCode || orig.competency_code || orig.competencyCode || ''}</td>
                              <td className="p-1 align-top">{orig.StandardSource || orig.standard_source || orig.standardSource || ''}</td>
                              <td className="p-1 align-top">{orig.StandardCode || orig.standard_code || orig.standardCode || ''}</td>
                              <td className="p-1 align-top" title={errMsg}>{short}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {/* Maintenance (dev-only) */}
            {process.env.NODE_ENV === 'development' && (
              <div className="mt-4">
                <h4 className="font-semibold mb-2">Maintenance</h4>
                <div className="text-sm text-white/75 mb-2">Deletes import error CSV files older than TTL.</div>
                <div className="flex gap-2 items-center">
                  <input placeholder="Paste maintenance key (dev only)" value={maintenanceKey ?? ''} onChange={e => setMaintenanceKey(e.target.value)} className="p-2 rounded bg-white/5 flex-1 text-sm" />
                  <button className="btn-secondary" onClick={runMaintenance} disabled={maintenanceRunning || !maintenanceKey}>
                    {maintenanceRunning ? 'Running...' : 'Run cleanup'}
                  </button>
                </div>
                {maintenanceResult && (
                  <div className="mt-2 p-2 bg-blue-700/20 rounded text-sm">
                    Deleted: {maintenanceResult.deleted}, Kept: {maintenanceResult.kept}, Errors: {maintenanceResult.errors}
                  </div>
                )}
                {maintenanceError && (
                  <div className="mt-2 p-2 bg-red-700/20 rounded text-sm">{maintenanceError}</div>
                )}
              </div>
            )}
          </div>
        </aside>

        <main className="col-span-9">
          <div className="bg-glass p-4 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Mappings</h2>
              <div className="text-sm text-white/75">{total} rows</div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-sm text-white/75">
                    <th className="p-2">Competency Code</th>
                    <th className="p-2">Competency Title</th>
                    <th className="p-2">Standard Source</th>
                    <th className="p-2">Standard Code</th>
                    <th className="p-2">Standard Title</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="p-2 align-top">{r.competency.code}</td>
                      <td className="p-2 align-top">{r.competency.title}</td>
                      <td className="p-2 align-top">
                        {editingId === r.id ? (
                          <input value={editSource} onChange={e => { setEditSource(e.target.value); suggestStandards(e.target.value) }} className="p-1 rounded bg-white/5" />
                        ) : r.standard?.source}
                      </td>
                      <td className="p-2 align-top">
                        {editingId === r.id ? (
                          <div>
                            <input value={editCode} onChange={e => { setEditCode(e.target.value); suggestStandards(e.target.value) }} className="p-1 rounded bg-white/5" list="std-suggestions" />
                            <datalist id="std-suggestions">
                              {suggestions.map(s => (<option key={s.id} value={`${s.code}`} />))}
                            </datalist>
                          </div>
                        ) : r.standard?.code}
                      </td>
                      <td className="p-2 align-top">{r.standard?.title}</td>
                      <td className="p-2 align-top">
                        {editingId === r.id ? (
                          <div className="flex gap-2">
                            <button className="btn-primary" onClick={() => saveEdit(r.id)}>Save</button>
                            <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button className="btn-secondary" onClick={() => startEdit(r)}>Edit</button>
                            <button className="btn-primary" onClick={() => handleDelete(r.id)}>Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-white/75">Page {page}</div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
                <button className="btn-primary" onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
