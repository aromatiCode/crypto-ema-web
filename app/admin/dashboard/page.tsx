import { getCurrentUser } from "@/lib/admin";
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const username = await getCurrentUser();
  if (!username) redirect("/admin/login");
  return (
    <main className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Admin Dashboard</h1>
            <p className="subtitle">Signed in as <strong>{username}</strong></p>
          </div>
          <form action="/api/admin/logout" method="post" className="admin-logout-form">
            <button type="submit" className="refresh-btn">Sign out</button>
          </form>
        </div>
      </header>
      <AdminDashboard />
    </main>
  );
}
