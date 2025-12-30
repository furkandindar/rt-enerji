"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Plus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LeaveRequest {
  id: string;
  status: string;
  current_step: number;
  created_at: string;
  workflow_definition: {
    id: string;
    code: string;
    name: string;
  };
  leave_request: {
    leave_type: string;
    start_datetime: string;
    end_datetime: string;
    total_days: number;
  };
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-500",
  PENDING: "bg-yellow-500",
  APPROVED: "bg-green-500",
  REJECTED: "bg-red-500",
  CANCELLED: "bg-gray-400",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Taslak",
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal Edildi",
};

const leaveTypeLabels: Record<string, string> = {
  ANNUAL_LEAVE: "Yıllık İzin",
  SHORT_LEAVE: "Kısa Süreli İzin",
};

export default function LeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await fetch("/api/leave-requests");
      if (response.ok) {
        const data = await response.json();
        setRequests(data);
      }
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taleplerim</h1>
          <p className="text-muted-foreground">
            Oluşturduğunuz izin taleplerini görüntüleyin
          </p>
        </div>
        <Button asChild>
          <Link href="/leave-requests/new">
            <Plus className="mr-2 h-4 w-4" />
            Yeni Talep
          </Link>
        </Button>
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border rounded-lg">
          <p className="text-muted-foreground mb-4">Henüz izin talebiniz yok</p>
          <Button asChild>
            <Link href="/leave-requests/new">
              <Plus className="mr-2 h-4 w-4" />
              İlk Talebinizi Oluşturun
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>İzin Tipi</TableHead>
                <TableHead>Başlangıç</TableHead>
                <TableHead>Bitiş</TableHead>
                <TableHead>Gün</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Oluşturulma</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">
                    {leaveTypeLabels[request.leave_request?.leave_type] || "-"}
                  </TableCell>
                  <TableCell>
                    {request.leave_request?.start_datetime
                      ? format(new Date(request.leave_request.start_datetime), "d MMM yyyy", { locale: tr })
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {request.leave_request?.end_datetime
                      ? format(new Date(request.leave_request.end_datetime), "d MMM yyyy", { locale: tr })
                      : "-"}
                  </TableCell>
                  <TableCell>{request.leave_request?.total_days || "-"}</TableCell>
                  <TableCell>
                    <Badge className={statusColors[request.status]}>
                      {statusLabels[request.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(request.created_at), "d MMM yyyy HH:mm", { locale: tr })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

