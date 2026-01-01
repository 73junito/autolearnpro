"use client"
import Image from 'next/image'

export default function PreviewPlaceholder() {
  return (
    <div className="w-full h-64 md:h-80 lg:h-96 bg-gradient-to-br from-indigo-600/40 to-sky-600/30 rounded-2xl flex items-center justify-center border border-white/5 overflow-hidden">
      <div className="text-center text-white/90 px-6">
        <div className="mb-3 text-sm uppercase tracking-wide text-white/60">Platform preview</div>
        <div className="text-lg md:text-2xl font-semibold">Dashboard & competency map</div>
        <div className="mt-4 text-sm text-white/75">Placeholder visual — replace with mockup or screenshot for demos</div>
      </div>
    </div>
  )
}
