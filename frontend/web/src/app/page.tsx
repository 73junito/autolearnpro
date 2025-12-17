import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-6">
          Welcome to AutoLearnPro LMS
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Professional Automotive and Diesel Training Platform
        </p>
        <div className="flex gap-4 justify-center">
          <Link 
            href="/login"
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            Login
          </Link>
          <Link 
            href="/register"
            className="px-8 py-3 bg-white text-blue-600 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-semibold"
          >
            Register
          </Link>
        </div>
        
        <div className="mt-16 grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">📚 Comprehensive Courses</h3>
            <p className="text-gray-600">Access structured automotive and diesel training content</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">🎯 Track Progress</h3>
            <p className="text-gray-600">Monitor your learning journey with detailed analytics</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">🏆 Earn Badges</h3>
            <p className="text-gray-600">Get certified as you complete courses and assessments</p>
          </div>
        </div>
      </div>
    </main>
  )
}
