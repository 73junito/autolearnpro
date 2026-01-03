"use client";

import useSWR from 'swr';
import { CourseSummary, listCourses } from '../api/courses';

export default function useCourses(params: Record<string, any> = {}) {
  const key = ['/courses', JSON.stringify(params)];
  const { data, error, isLoading } = useSWR(key, () => listCourses(params));

  return { data: (data as CourseSummary[]) || [], loading: Boolean(isLoading), error } as const;
}
