"use client";

import { FormEvent, useEffect, useState } from "react";

export default function AdminDashboard() {
  const [tokens, setTokens] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newToken, setNewToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwInfo, setPwInfo] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    refreshTokens();
  }, []);

  async function refreshTokens() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tokens", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        const data = (await res.json()) as { tokens: string[] };
        setTokens(data.tokens);
      }
    } catch (e) {
      setError("Network error loading tokens.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newToken.trim()) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/admin/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: newToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add token.");
      } else {
        setInfo(`Added ${newToken.toUpperCase()}. Vercel will redeploy shortly.`);
        setNewToken("");
        await refreshTokens();
      }
    } catch {
      setError("Network error adding token.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(symbol: string) {
    if (!confirm(`Remove ${symbol} from the list?`)) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/admin/tokens", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: symbol }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to remove token.");
      } else {
        setInfo(`Removed ${symbol}. Vercel will redeploy shortly.`);
        await refreshTokens();
      }
    } catch {
      setError("Network error removing token.");
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwError(null);
    setPwInfo(null);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error ?? "Failed to change password.");
      } else {
        setPwInfo("Password updated. Use it on your next sign-in.");
        setCurrentPw("");
        setNewPw("");
      }
    } catch {
      setPwError("Network error.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="admin-grid">
      <section className="admin-card">
        <h2 className="admin-section-title">Tokens ({tokens.length})</h2>
        <form onSubmit={handleAdd} className="admin-add-form">
          <input
            type="text"
            value={newToken}
            onChange={(e) => setNewToken(e.target.value.toUpperCase())}
            placeholder="e.g. SOL"
            className="filter-input"
            maxLength={20}
            disabled={busy}
          />
          <button type="submit" className="refresh-btn" disabled={busy || !newToken.trim()}>
            Add
          </button>
        </form>
        {error && <div className="admin-error">{error}</div>}
        {info && <div className="admin-info">{info}</div>}
        {loading ? (
          <p className="admin-hint">Loading…</p>
        ) : (
          <ul className="admin-token-list">
            {tokens.map((t) => (
              <li key={t} className="admin-token-item">
                <span className="admin-token-sym">{t}</span>
                <button
                  type="button"
                  className="admin-token-remove"
                  onClick={() => handleRemove(t)}
                  disabled={busy}
                  aria-label={`Remove ${t}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-card">
        <h2 className="admin-section-title">Change password</h2>
        <form onSubmit={handleChangePassword} className="admin-form">
          <label className="admin-label">
            Current password
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="filter-input"
              autoComplete="current-password"
              required
            />
          </label>
          <label className="admin-label">
            New password
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="filter-input"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          {pwError && <div className="admin-error">{pwError}</div>}
          {pwInfo && <div className="admin-info">{pwInfo}</div>}
          <button type="submit" className="refresh-btn admin-submit" disabled={pwBusy}>
            {pwBusy ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}
