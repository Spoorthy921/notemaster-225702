export type TokenResponse = { access_token: string; token_type: string };

export type Tag = { id: string; name: string };

export type Note = {
  id: string;
  title: string;
  content_markdown: string;
  is_pinned: boolean;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  tags: Tag[];
};

export type NotesListResponse = { items: Note[]; total: number };

const TOKEN_KEY = "notemaster_token";

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (!token) window.localStorage.removeItem(TOKEN_KEY);
  else window.localStorage.setItem(TOKEN_KEY, token);
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function signup(email: string, password: string) {
  const data = await apiFetch<TokenResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.access_token);
  return data;
}

export async function login(email: string, password: string) {
  const data = await apiFetch<TokenResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.access_token);
  return data;
}

export async function listTags() {
  return apiFetch<Tag[]>("/api/tags");
}

export async function listNotes(params: {
  q?: string;
  tag?: string;
  pinned?: boolean;
  favorite?: boolean;
  limit?: number;
  offset?: number;
}) {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.tag) usp.set("tag", params.tag);
  if (params.pinned !== undefined) usp.set("pinned", String(params.pinned));
  if (params.favorite !== undefined) usp.set("favorite", String(params.favorite));
  usp.set("limit", String(params.limit ?? 50));
  usp.set("offset", String(params.offset ?? 0));
  return apiFetch<NotesListResponse>(`/api/notes?${usp.toString()}`);
}

export async function createNote(payload: {
  title: string;
  content_markdown: string;
  is_pinned: boolean;
  is_favorite: boolean;
  tags: string[];
}) {
  return apiFetch<Note>("/api/notes", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateNote(
  id: string,
  payload: Partial<{
    title: string;
    content_markdown: string;
    is_pinned: boolean;
    is_favorite: boolean;
    tags: string[];
  }>
) {
  return apiFetch<Note>(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteNote(id: string) {
  return apiFetch<void>(`/api/notes/${id}`, { method: "DELETE" });
}
