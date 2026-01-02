import { useEffect, useState } from 'react';
import { CourseDetail } from '../api/courses';
import coursesApi from '../api/courses';

export default function useCourse(id?: number | string) {
  const [data, setData] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    if (id === undefined || id === null) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await coursesApi.getCourse(Number(id));
        if (!mounted) return;
        setData(res || null);
      } catch (e) {
        if (!mounted) return;
        setError(e);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  return { data, loading, error } as const;
}
