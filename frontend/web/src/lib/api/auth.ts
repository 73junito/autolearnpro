import client from './client';

export async function login(email: string, password: string) {
  return client.request('/login', { method: 'POST', body: { email, password } });
}

export async function register(payload: Record<string, any>) {
  return client.request('/register', { method: 'POST', body: { user: payload } });
}

export default { login, register };
