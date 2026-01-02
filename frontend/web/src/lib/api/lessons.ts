import client from './client';

export type Lesson = {
  id: number;
  title: string;
  lesson_type?: string;
  duration_minutes?: number;
  media_urls?: Record<string,string>;
  transcript?: string;
  resources?: Array<{label:string, url:string}>;
};

export async function getLesson(id: number) {
  const res = await client.request(`/lessons/${id}`);
  return res || null;
}

export default { getLesson };
