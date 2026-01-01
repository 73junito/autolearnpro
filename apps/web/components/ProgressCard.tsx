export type ProgressProps = {
  courseTitle: string
  progressPercent: number
}

export default function ProgressCard({ courseTitle, progressPercent }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(progressPercent)))
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{courseTitle}</h3>
        <span className="text-xs text-slate-500">{pct}%</span>
      </div>
      <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-2 bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
