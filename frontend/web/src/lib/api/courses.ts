import client from './client';

export type CourseSummary = {
  id: number;
  code: string;
  title: string;
  description?: string;
  credits?: number;
  delivery_mode?: string;
  active?: boolean;
};

export type CourseDetail = CourseSummary & {
  syllabus?: any;
  modules?: any[];
};

export async function listCourses(params: Record<string, any> = {}) {
  const qp = new URLSearchParams(params).toString();
  const path = `/courses${qp ? '?' + qp : ''}`;
  const res = await client.request(path);
  return res?.data || [];
}

export async function getCourse(id: number) {
  const res = await client.request(`/courses/${id}`);
  return res?.data || null;
}

export default { listCourses, getCourse };
