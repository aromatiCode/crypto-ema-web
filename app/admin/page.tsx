import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminIndex() {
  const user = await getCurrentUser();
  if (user) redirect("/admin/dashboard");
  redirect("/admin/login");
}
