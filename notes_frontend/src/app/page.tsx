"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  createNote,
  deleteNote,
  getToken,
  listNotes,
  listTags,
  login,
  Note,
  setToken,
  signup,
  Tag,
  updateNote,
} from "@/lib/api";
import ReactMarkdown from "react-markdown";

type AuthMode = "login" | "signup";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function Home() {
  const [ready, setReady] = useState(false);

  // auth
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // data
  const [tags, setTags] = useState<Tag[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [total, setTotal] = useState(0);

  // filters
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [filterPinned, setFilterPinned] = useState<boolean | null>(null);
  const [filterFavorite, setFilterFavorite] = useState<boolean | null>(null);

  // selection + editor state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => notes.find((n) => n.id === selectedId) || null, [notes, selectedId]);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftPinned, setDraftPinned] = useState(false);
  const [draftFavorite, setDraftFavorite] = useState(false);
  const [draftTags, setDraftTags] = useState("");

  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastSavedRef = useRef<{ title: string; body: string; pinned: boolean; favorite: boolean; tags: string } | null>(
    null
  );

  useEffect(() => {
    setReady(true);
  }, []);

  async function refreshAll() {
    setError(null);
    const [t, n] = await Promise.all([
      listTags(),
      listNotes({
        q: query || undefined,
        tag: activeTag || undefined,
        pinned: filterPinned === null ? undefined : filterPinned,
        favorite: filterFavorite === null ? undefined : filterFavorite,
        limit: 200,
        offset: 0,
      }),
    ]);
    setTags(t);
    setNotes(n.items);
    setTotal(n.total);

    // keep selection valid
    if (selectedId && !n.items.some((x) => x.id === selectedId)) {
      setSelectedId(null);
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!getToken()) return;
    refreshAll().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (!getToken()) return;
    refreshAll().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeTag, filterPinned, filterFavorite]);

  useEffect(() => {
    // When selection changes, populate draft
    if (!selected) {
      setDraftTitle("");
      setDraftBody("");
      setDraftPinned(false);
      setDraftFavorite(false);
      setDraftTags("");
      lastSavedRef.current = null;
      return;
    }
    setDraftTitle(selected.title);
    setDraftBody(selected.content_markdown);
    setDraftPinned(selected.is_pinned);
    setDraftFavorite(selected.is_favorite);
    setDraftTags(selected.tags.map((t) => t.name).join(", "));
    lastSavedRef.current = {
      title: selected.title,
      body: selected.content_markdown,
      pinned: selected.is_pinned,
      favorite: selected.is_favorite,
      tags: selected.tags.map((t) => t.name).join(", "),
    };
  }, [selected]);

  // Autosave (debounced)
  useEffect(() => {
    if (!selected) return;
    const snap = { title: draftTitle, body: draftBody, pinned: draftPinned, favorite: draftFavorite, tags: draftTags };
    const last = lastSavedRef.current;
    if (last && JSON.stringify(last) === JSON.stringify(snap)) return;

    const handle = window.setTimeout(async () => {
      try {
        setBusy("Autosaving…");
        await updateNote(selected.id, {
          title: draftTitle,
          content_markdown: draftBody,
          is_pinned: draftPinned,
          is_favorite: draftFavorite,
          tags: draftTags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
        lastSavedRef.current = snap;
        await refreshAll();
      } catch (e: any) {
        setError(e?.message || "Autosave failed");
      } finally {
        setBusy(null);
      }
    }, 700);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftTitle, draftBody, draftPinned, draftFavorite, draftTags]);

  async function onAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(mode === "login" ? "Logging in…" : "Creating account…");
    try {
      if (mode === "login") await login(email, password);
      else await signup(email, password);
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || "Authentication failed");
    } finally {
      setBusy(null);
    }
  }

  async function onLogout() {
    setToken(null);
    setNotes([]);
    setTags([]);
    setSelectedId(null);
  }

  async function onNewNote() {
    setError(null);
    setBusy("Creating…");
    try {
      const n = await createNote({
        title: "Untitled",
        content_markdown: "",
        is_pinned: false,
        is_favorite: false,
        tags: [],
      });
      await refreshAll();
      setSelectedId(n.id);
    } catch (e: any) {
      setError(e?.message || "Failed to create note");
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteSelected() {
    if (!selected) return;
    setError(null);
    setBusy("Deleting…");
    try {
      await deleteNote(selected.id);
      await refreshAll();
      setSelectedId(null);
    } catch (e: any) {
      setError(e?.message || "Failed to delete note");
    } finally {
      setBusy(null);
    }
  }

  const authed = ready && !!getToken();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-primary)" }}>NoteMaster</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Retro Notes • Gray theme
              </div>
            </div>
            <span className="kbd">⌘K</span>
          </div>
        </div>

        {!authed ? (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                className={`btn ${mode === "login" ? "btn-primary" : ""}`}
                onClick={() => setMode("login")}
                type="button"
              >
                Log in
              </button>
              <button
                className={`btn ${mode === "signup" ? "btn-primary" : ""}`}
                onClick={() => setMode("signup")}
                type="button"
              >
                Sign up
              </button>
            </div>

            <form onSubmit={onAuthSubmit} style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  Email
                </span>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  Password
                </span>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </label>

              <button className="btn btn-success" type="submit" disabled={!!busy}>
                {busy ? busy : mode === "login" ? "Log in" : "Create account"}
              </button>

              <p className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                Backend: <code>{process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001"}</code>
              </p>
            </form>
          </div>
        ) : (
          <>
            <div className="card" style={{ padding: 14, marginBottom: 14 }}>
              <button className="btn" onClick={onNewNote} type="button" style={{ width: "100%" }}>
                + New note
              </button>
              <div style={{ height: 10 }} />
              <button className="btn" onClick={onLogout} type="button" style={{ width: "100%" }}>
                Log out
              </button>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, color: "var(--color-primary)", marginBottom: 8 }}>Tags</div>
              <div style={{ display: "grid", gap: 6 }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => setActiveTag(null)}
                  style={{ textAlign: "left", opacity: activeTag ? 0.9 : 1, fontWeight: activeTag ? 500 : 700 }}
                >
                  All
                </button>

                {tags.map((t) => (
                  <button
                    key={t.id}
                    className="btn"
                    type="button"
                    onClick={() => setActiveTag(t.name)}
                    style={{
                      textAlign: "left",
                      fontWeight: activeTag === t.name ? 700 : 500,
                      borderColor: activeTag === t.name ? "rgba(55,65,81,0.45)" : undefined,
                    }}
                  >
                    #{t.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {error ? (
          <div className="card" style={{ padding: 12, marginTop: 14, borderColor: "rgba(239,68,68,0.35)" }}>
            <div style={{ color: "var(--color-error)", fontWeight: 700, marginBottom: 6 }}>Error</div>
            <div style={{ fontSize: 12, lineHeight: 1.4 }}>{error}</div>
          </div>
        ) : null}
      </aside>

      <section style={{ display: "grid", gridTemplateRows: "auto 1fr", minHeight: 0 }}>
        <header className="topbar">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
            <input
              className="input"
              placeholder="Search notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!authed}
            />
            <button
              className="btn"
              type="button"
              onClick={() => setFilterPinned(filterPinned === true ? null : true)}
              disabled={!authed}
              style={{ whiteSpace: "nowrap" }}
            >
              {filterPinned === true ? "Pinned ✓" : "Pinned"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setFilterFavorite(filterFavorite === true ? null : true)}
              disabled={!authed}
              style={{ whiteSpace: "nowrap" }}
            >
              {filterFavorite === true ? "Favorite ✓" : "Favorite"}
            </button>
          </div>

          <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            {authed ? `${total} note${total === 1 ? "" : "s"}` : "Sign in to view notes"}
          </div>
        </header>

        <div className="main">
          <div className="panel">
            <div style={{ padding: 14, borderBottom: "var(--border)" }}>
              <div style={{ fontWeight: 700, color: "var(--color-primary)" }}>Notes</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Click a note to edit • Autosave on changes
              </div>
            </div>

            <div style={{ padding: 10, display: "grid", gap: 10 }}>
              {!authed ? (
                <div className="card" style={{ padding: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Welcome</div>
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
                    Create an account or log in to start taking notes with tags, pin/favorite, and markdown preview.
                  </div>
                </div>
              ) : notes.length === 0 ? (
                <div className="card" style={{ padding: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>No notes yet</div>
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
                    Create your first note with <b>New note</b>.
                  </div>
                </div>
              ) : (
                notes.map((n) => {
                  const active = n.id === selectedId;
                  return (
                    <button
                      key={n.id}
                      className="card"
                      onClick={() => setSelectedId(n.id)}
                      style={{
                        padding: 12,
                        textAlign: "left",
                        cursor: "pointer",
                        borderColor: active ? "rgba(55,65,81,0.45)" : "rgba(55,65,81,0.16)",
                        outline: "none",
                        background: active ? "rgba(55,65,81,0.04)" : "var(--color-surface)",
                      }}
                      type="button"
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 700, color: "var(--color-primary)" }}>
                          {n.title || "Untitled"}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {n.is_pinned ? "Pinned" : n.is_favorite ? "Fav" : ""}
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        Updated {fmtDate(n.updated_at)}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {n.tags.slice(0, 4).map((t) => (
                          <span
                            key={t.id}
                            style={{
                              fontSize: 12,
                              padding: "3px 8px",
                              borderRadius: 999,
                              border: "var(--border)",
                              background: "rgba(55,65,81,0.04)",
                              color: "var(--color-primary)",
                            }}
                          >
                            #{t.name}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="editor">
            <div style={{ padding: 14, borderBottom: "var(--border)", display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--color-primary)" }}>
                  {selected ? "Editor" : "No note selected"}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {busy ? busy : selected ? "Autosave enabled" : "Select a note from the list"}
                </div>
              </div>

              <button className="btn" type="button" onClick={() => setPreview((p) => !p)} disabled={!selected}>
                {preview ? "Edit" : "Preview"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={onDeleteSelected}
                disabled={!selected || !!busy}
                style={{ borderColor: "rgba(239,68,68,0.3)", color: "var(--color-error)" }}
              >
                Delete
              </button>
            </div>

            <div style={{ padding: 14, display: "grid", gap: 12 }}>
              {selected ? (
                <>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span className="muted" style={{ fontSize: 12 }}>
                      Title
                    </span>
                    <input className="input" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
                  </label>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className={`btn ${draftPinned ? "btn-primary" : ""}`} type="button" onClick={() => setDraftPinned((v) => !v)}>
                      {draftPinned ? "Pinned ✓" : "Pin"}
                    </button>
                    <button className={`btn ${draftFavorite ? "btn-primary" : ""}`} type="button" onClick={() => setDraftFavorite((v) => !v)}>
                      {draftFavorite ? "Favorite ✓" : "Favorite"}
                    </button>
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span className="muted" style={{ fontSize: 12 }}>
                      Tags (comma separated)
                    </span>
                    <input className="input" value={draftTags} onChange={(e) => setDraftTags(e.target.value)} />
                  </label>

                  {preview ? (
                    <div className="card" style={{ padding: 14 }}>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                        Markdown preview
                      </div>
                      <article style={{ lineHeight: 1.55 }}>
                        <ReactMarkdown>{draftBody || "_(empty)_"}</ReactMarkdown>
                      </article>
                    </div>
                  ) : (
                    <label style={{ display: "grid", gap: 6 }}>
                      <span className="muted" style={{ fontSize: 12 }}>
                        Content (Markdown)
                      </span>
                      <textarea
                        className="input"
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        rows={14}
                        style={{ resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
                      />
                    </label>
                  )}
                </>
              ) : (
                <div className="card" style={{ padding: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Tip</div>
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
                    Use the sidebar to create a note, then edit it here. Toggle <b>Preview</b> to render markdown.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
