"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { leaveTypeLabels } from "@/lib/approvals/constants";
import type { PendingApproval } from "@/lib/approvals/types";

interface LeaveRequestDetailsProps {
  approval: PendingApproval;
}

export function LeaveRequestDetails({ approval }: LeaveRequestDetailsProps) {
  const leave = approval.request.leave_request;
  if (!leave) return null;
  // Uzaktan Çalışma Formu izin altyapısını kullanır; etiketler izin değil
  const isRemoteWork = leave.leave_type === "REMOTE_WORK";

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{isRemoteWork ? "Talep Türü" : "İzin Türü"}</p>
          <p className="text-sm font-semibold">
            {leaveTypeLabels[leave.leave_type] || "-"}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">{isRemoteWork ? "Toplam İş Günü" : "Toplam Gün"}</p>
          <p className="text-sm font-semibold">
            {leave.total_days || "-"} gün
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Başlangıç</p>
          <p className="text-sm font-semibold">
            {format(new Date(leave.start_datetime), "d MMMM yyyy HH:mm", { locale: tr })}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Bitiş</p>
          <p className="text-sm font-semibold">
            {format(new Date(leave.end_datetime), "d MMMM yyyy HH:mm", { locale: tr })}
          </p>
        </div>
      </div>
      {leave.reason && (
        <div>
          <p className="text-sm font-medium text-muted-foreground">{isRemoteWork ? "Talep Nedeni" : "İzin Nedeni"}</p>
          <p className="text-sm font-semibold">{leave.reason}</p>
        </div>
      )}
      {(leave.remaining_days !== null || leave.hr_note) && (
        <div className="grid grid-cols-2 gap-4 border-t pt-3 mt-1">
          {leave.remaining_days !== null && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Kalan İzin Günü</p>
              <p className="text-sm font-semibold">
                {leave.remaining_days} gün
              </p>
            </div>
          )}
          {leave.hr_note && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">İK Notu</p>
              <p className="text-sm font-semibold">{leave.hr_note}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

