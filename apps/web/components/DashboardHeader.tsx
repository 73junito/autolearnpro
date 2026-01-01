export default function DashboardHeader({ title = 'Your dashboard' }: { title?: string }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-slate-600">Overview of your enrolled courses and progress</p>
      </div>
    </div>
  )
}
