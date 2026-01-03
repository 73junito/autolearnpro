"use client";

import React from 'react';
import CourseList from '../../components/courses/CourseList';

export default function CoursesPage() {
  return (
    <main className="px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold">Course Catalog</h1>
        <CourseList />
      </div>
    </main>
  );
}
