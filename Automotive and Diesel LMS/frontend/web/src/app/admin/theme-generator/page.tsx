"use client"

import { useState } from "react";

export default function ThemeGeneratorPage() {
  const [prompt, setPrompt] = useState("Cinematic automotive workshop, technician silhouette, warm teal highlights, high detail");
  const [width, setWidth] = useState(1200);
  const [height, setHeight] = useState(630);
  const [filename, setFilename] = useState("og-homepage.png");
  const [status, setStatus] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setStatus("Searching MCP bridge...");
    const cached = typeof window !== 'undefined' ? window.localStorage.getItem('mcp_http_port') : null;
    const base = cached ? [Number(cached)] : [];
    const ports = [...new Set([...base, 5005, 5006, 5007, 5008, 5009, 5010])];
    let lastError: any = null;
    for (const p of ports) {
      try {
        setStatus(`Trying MCP bridge at port ${p}...`);
        const res = await fetch(`http://localhost:${p}/generate-theme-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, width, height, filename })
        });
        if (!res.ok) {
          lastError = await res.text();
          continue;
        }
        const data = await res.json();
        if (data?.url) {
          setImageUrl(data.url);
          setStatus(`Saved: ${data.url}`);
          try { window.localStorage.setItem('mcp_http_port', String(p)); } catch {}
          setBusy(false);
          return;
        }
        lastError = data;
      } catch (err) {
        lastError = err;
        continue;
      }
    }
    setStatus(`Failed to generate image: ${String(lastError)}`);
    setBusy(false);
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Theme Image Generator</h1>
      <div className="grid gap-3">
        <label className="block">
          <div className="text-sm text-gray-300">Prompt</div>
          <textarea className="w-full p-2 rounded bg-white/5" rows={4} value={prompt} onChange={e => setPrompt(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <label className="flex-1">
            <div className="text-sm text-gray-300">Width</div>
            <input type="number" className="w-full p-2 rounded bg-white/5" value={width} onChange={e => setWidth(Number(e.target.value))} />
          </label>
          <label className="flex-1">
            <div className="text-sm text-gray-300">Height</div>
            <input type="number" className="w-full p-2 rounded bg-white/5" value={height} onChange={e => setHeight(Number(e.target.value))} />
          </label>
        </div>
        <label>
          <div className="text-sm text-gray-300">Filename (saved to /images)</div>
          <input className="w-full p-2 rounded bg-white/5" value={filename} onChange={e => setFilename(e.target.value)} />
        </label>

        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Generating...' : 'Generate Image'}</button>
          <button className="btn-secondary" onClick={() => { setImageUrl(null); setStatus(null); }}>Reset</button>
        </div>

        {status && <div className="text-sm text-white/80">{status}</div>}

        {imageUrl && (
          <div className="mt-4">
            <div className="text-sm text-white/80 mb-2">Preview (reload page to see new file if not showing)</div>
            <img src={imageUrl} alt="Generated" className="w-full rounded shadow-lg" />
            <div className="mt-2 text-sm text-white/70">URL: <code>{imageUrl}</code></div>
          </div>
        )}
      </div>
    </div>
  );
}
