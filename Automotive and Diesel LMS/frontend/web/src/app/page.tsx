import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import ThemeLoader from '@/components/ThemeLoader'

const PreviewPlaceholder = dynamic(() => import('@/components/PreviewPlaceholder'), { ssr: false })

export default function Home() {
  return (
    <main className="min-h-screen bg-hero-gradient text-white">
      <ThemeLoader />
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div>
            <div className="flex items-center gap-4 mb-6">
              <Image src="/images/icons/icon-192.svg" alt="AutoLearnPro logo" width={64} height={64} className="w-16 h-16 rounded-md shadow" priority />
              <div>
                <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">AutoLearnPro LMS</h1>
                <p className="text-sm text-white/75">Automotive & Diesel Competency Platform</p>
              </div>
            </div>

            <h2 className="text-2xl md:text-3xl font-semibold mb-4">Train technicians. Validate skills. Certify competency.</h2>
            <p className="text-white/80 mb-6 max-w-xl">Hands-on, standards-aligned training and assessments for technicians, instructors, and program administrators. Competency-based progression, evidence-backed labs, and exportable reports for audits and funding.</p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link href="/login" className="block bg-primary-600 hover:bg-primary-500 text-white px-4 py-3 rounded-lg text-center">Start Learning</Link>
              <Link href="/dashboard" className="block bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-lg text-center">Instructor Tools</Link>
              <Link href="/dashboard" className="block bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-lg text-center">Program Analytics</Link>
            </div>

            <div className="mt-10 bg-glass p-6 rounded-lg shadow-lg max-w-xl">
              <h3 className="text-lg font-semibold mb-3">Core outcomes</h3>
              <ul className="list-disc list-inside text-white/85 space-y-2">
                <li>Competency-based progression (not seat time)</li>
                <li>Evidence-backed labs & skill validation</li>
                <li>Standards mapping: FWG, ASE, Perkins (configurable)</li>
                <li>Exportable reports for audits and funding</li>
              </ul>
            </div>

            <div className="mt-6 text-sm text-white/75">
              <strong>Built for:</strong> CTE programs, workforce pipelines, and DoD/fleet training.
            </div>
          </div>

          <div className="order-first lg:order-last">
            <PreviewPlaceholder />
          </div>
        </div>

        <section className="mt-14">
          <div className="bg-white/5 p-6 rounded-lg shadow-inner">
            <h3 className="text-xl font-semibold mb-3">Why AutoLearnPro</h3>
            <p className="text-white/80">Designed to help programs move from seat-time to competency. Track mastery, map to industry standards, and produce auditable reports for funding and compliance.</p>
          </div>
        </section>
      </div>
    </main>
  )
}

