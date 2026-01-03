import { useEffect, useState } from 'react';
import { CourseSummary, listCourses } from '../api/courses';

export default function useCourses(params: Record<string, any> = {}) {
  const [data, setData] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listCourses(params);
        if (!mounted) return;
        setData(res || []);
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
    // stringify params to trigger effect when values change
  }, [JSON.stringify(params)]);

  return { data, loading, error } as const;
}
