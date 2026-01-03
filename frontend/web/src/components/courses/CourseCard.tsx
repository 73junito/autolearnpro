"use client";

import React from 'react';
import Link from 'next/link';
import type { CourseSummary } from '../../lib/api/courses';

export default function CourseCard({ course }: { course: CourseSummary }) {
  return (
    <article className="rounded-2xl border bg-white p-5" role="article" aria-labelledby={`course-${course.id}-title`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 overflow-hidden">
            <img src="/images/logo.png" alt={`${course.title} thumbnail`} className="h-full w-full object-cover" />
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-xs font-semibold text-blue-700">
            {course.code}
          </div>
          <div>
            <div id={`course-${course.id}-title`} className="text-sm font-semibold text-slate-900">{course.title}</div>
            <div className="text-xs text-slate-500">{course.delivery_mode || ''}</div>
          </div>
        </div>
        <Link href={`/courses/${course.id}`} className="text-sm text-blue-700 hover:underline" aria-label={`View ${course.title}`}>
          View
        </Link>
      </div>

      {course.description && (
        <p className="mt-3 text-sm text-slate-600 line-clamp-3">{course.description}</p>
      )}
    </article>
  );
}
