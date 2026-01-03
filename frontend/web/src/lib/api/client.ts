const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

export type FetchOptions = {
  method?: string;
  body?: any;
  token?: string;
};

async function request(path: string, opts: FetchOptions = {}) {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string,string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }

  if (!res.ok) {
    const err = new Error(data?.message || res.statusText || 'API error');
    (err as any).status = res.status;
    (err as any).data = data;
    throw err;
  }
  return data;
}

export const fetcher = (path: string) => request(path);

export default { request, fetcher };
