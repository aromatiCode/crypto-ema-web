import AdminLoginForm from "@/components/AdminLoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Admin Login</h1>
        <p className="subtitle">Sign in to manage the token list.</p>
      </header>
      <div className="admin-card">
        <AdminLoginForm from={searchParams.from ?? "/admin/dashboard"} />
        <p className="admin-hint">
          Default credentials: <code>admin</code> / <code>admin</code>.
          Change your password after signing in.
        </p>
      </div>
    </main>
  );
}
