import { redirect } from "next/navigation";

export default function AdminKnowledgePage() {
  redirect("/admin?tab=knowledge");
}
