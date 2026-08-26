// API base resolution for static export — Pattern 4 (03-RESEARCH.md:229-233, 402-416).
// NEXT_PUBLIC_API_BASE is inlined at build time; '' in production builds → same-origin /api/*.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

export const apiUrl = (p: string) => `${API_BASE}${p}`;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}
