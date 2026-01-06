import { redirect } from "next/navigation";

// /leave-requests artık /my-requests'e yönlendiriliyor
export default function LeaveRequestsPage() {
  redirect("/my-requests");
}

