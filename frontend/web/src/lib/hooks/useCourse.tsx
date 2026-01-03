"use client";

import useSWR from 'swr';
import { CourseDetail, getCourse } from '../api/courses';

export default function useCourse(id?: number | string) {
  const key = id !== undefined && id !== null ? `/courses/${id}` : null;
  const { data, error, isLoading } = useSWR(key, () => getCourse(Number(id)), { shouldRetryOnError: false });

  return { data: (data as CourseDetail) || null, loading: Boolean(isLoading), error } as const;
}
