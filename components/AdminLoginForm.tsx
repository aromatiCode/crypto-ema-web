"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  from: string;
}

export default function AdminLoginForm({ from }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        setLoading(false);
        return;
      }
      router.push(from || "/admin/dashboard");
      router.refresh();
    } catch (e) {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="admin-form">
      <label className="admin-label">
        Username
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="filter-input"
          autoComplete="username"
          required
        />
      </label>
      <label className="admin-label">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="filter-input"
          autoComplete="current-password"
          required
        />
      </label>
      {error && <div className="admin-error">{error}</div>}
      <button type="submit" className="refresh-btn admin-submit" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
