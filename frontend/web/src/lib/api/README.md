# Frontend API helpers

This folder contains lightweight fetch-based API helper functions used by the frontend.

Usage examples:

```ts
import { listCourses, getCourse } from '../lib/api/courses';

const courses = await listCourses({ page: 1, page_size: 20 });
const course = await getCourse(1);
```

Auth example:

```ts
import { login } from '../lib/api/auth';
const res = await login('user@example.com', 'password');
const token = res?.token;
```

Notes:
- These helpers call the `/api` namespace by default; set `NEXT_PUBLIC_API_BASE_URL` to override.
- They throw on non-2xx responses — catch errors in UI components and show friendly messages.
