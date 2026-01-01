"use client"

import { useEffect, useState } from 'react'

export default function ImageViewer() {
  const [url, setUrl] = useState('/images/og-homepage.svg')

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      setUrl(params.get('url') || '/images/og-homepage.svg')
    } catch (e) {
      // fallback: keep default
    }
  }, [])

  return (
    <div className="min-h-screen bg-hero-gradient text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Image Viewer</h1>
          <div className="flex gap-2">
            <a className="btn-secondary" href={url} target="_blank" rel="noreferrer">Open in new tab</a>
            <a className="btn-primary" href={url} download>
              Download
            </a>
          </div>
        </div>

        <div className="bg-glass rounded-lg p-4">
          <div className="text-sm text-white/75 mb-3">Viewing: <code>{url}</code></div>
          <div className="w-full h-[360px] flex items-center justify-center overflow-hidden rounded">
            <img src={url} alt="preview" className="max-w-full max-h-full object-contain" />
          </div>
        </div>
      </div>
    </div>
  )
}
