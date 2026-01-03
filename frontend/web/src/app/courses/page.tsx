"use client";
import React from 'react';
import useCourses from '../../lib/hooks/useCourses';

export default function CoursesPage() {
  const { data: courses, loading, error } = useCourses({ page: 1, page_size: 20 });

  return (
    <main style={{ padding: 24 }}>
      <h1>Course Catalog</h1>
      {loading && <p>Loading courses…</p>}
      {error && <p style={{ color: 'crimson' }}>Error loading courses: {String(error?.message || error)}</p>}
      {!loading && courses.length === 0 && <p>No courses found.</p>}
      <ul>
        {courses.map((c: any) => (
          <li key={c.id} style={{ marginBottom: 12 }}>
            <strong>{c.title}</strong> — <em>{c.code}</em>
            <div style={{ fontSize: 13, color: '#444' }}>{c.description}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
