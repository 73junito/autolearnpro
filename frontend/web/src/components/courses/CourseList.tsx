"use client";

import React from 'react';
import useCourses from '../../lib/hooks/useCourses';
import CourseCard from './CourseCard';

export default function CourseList({ params }: { params?: Record<string, any> }) {
  const [page, setPage] = React.useState<number>(1);
  const [pageSize] = React.useState<number>(24);
  const [query, setQuery] = React.useState<string>('');

  const searchParams = { ...(params || {}), page, page_size: pageSize, q: query };
  const { data: courses, loading, error } = useCourses(searchParams);

  const onNext = () => {
    if (!courses || courses.length < pageSize) return; // likely last page
    setPage((p) => p + 1);
  };
  const onPrev = () => setPage((p) => Math.max(1, p - 1));

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <input
            aria-label="Search courses"
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Search by title or code"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <button onClick={onPrev} className="rounded px-3 py-1 border" disabled={page === 1}>Prev</button>
          <span>Page {page}</span>
          <button onClick={onNext} className="rounded px-3 py-1 border" disabled={!courses || courses.length < pageSize}>Next</button>
        </div>
      </div>

      {loading && <div className="p-6">Loading courses…</div>}
      {error && <div className="p-6 text-red-600">Error loading courses: {String(error?.message || error)}</div>}

      {!loading && (!courses || courses.length === 0) && (
        <div className="p-6">No courses found.</div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses?.map((c: any) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </div>
    </section>
  );
}
