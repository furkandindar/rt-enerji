"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  CalendarPlus,
  FileCheck,
  Bell,
  ClipboardList,
  Loader2,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface WorkflowSummary {
  pendingApprovalsCount: number;
  myRequests: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  unreadNotifications: number;
  recentRequests: Array<{
    id: string;
    status: string;
    created_at: string;
    workflow_definition: { name: string };
  }>;
}

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-500",
  APPROVED: "bg-green-500",
  REJECTED: "bg-red-500",
  AWAITING_COMPLETION: "bg-blue-500",
  COMPLETED: "bg-green-700",
};

const statusLabels: Record<string, string> = {
  PENDING: "Beklemede",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  AWAITING_COMPLETION: "Tamamlanma Bekleniyor",
  COMPLETED: "Tamamlandı",
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const response = await fetch("/api/dashboard/workflow-summary");
      if (response.ok) {
        const data = await response.json();
        setSummary(data);
      }
    } catch (error) {
      console.error("Error fetching summary:", error);
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
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hoş Geldiniz</h1>
        <p className="text-muted-foreground">
          RT Enerji Organizasyon Yönetim Sistemi
        </p>
      </div>

      {/* Hızlı Erişim Kartları */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Bekleyen Onaylar */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Bekleyen Onaylar</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.pendingApprovalsCount || 0}
            </div>
            <Button variant="link" className="px-0 mt-2" asChild>
              <Link href="/approvals">
                Onaylara Git <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Taleplerim */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Taleplerim</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.myRequests.total || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.myRequests.pending || 0} beklemede
            </p>
            <Button variant="link" className="px-0 mt-2" asChild>
              <Link href="/leave-requests">
                Taleplere Git <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Bildirimler */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Bildirimler</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.unreadNotifications || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">okunmamış</p>
            <Button variant="link" className="px-0 mt-2" asChild>
              <Link href="/notifications">
                Bildirimlere Git <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Yeni Talep */}
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Yeni İzin Talebi</CardTitle>
            <CalendarPlus className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-sm opacity-90 mb-4">
              Yıllık izin veya kısa süreli izin talebi oluşturun
            </p>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/leave-requests/new">Talep Oluştur</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Son Talepler */}
      {summary?.recentRequests && summary.recentRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Son Taleplerim</CardTitle>
            <CardDescription>
              En son oluşturduğunuz izin talepleri
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summary.recentRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">
                      {request.workflow_definition?.name || "İzin Talebi"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(request.created_at), "d MMMM yyyy", {
                        locale: tr,
                      })}
                    </p>
                  </div>
                  <Badge className={statusColors[request.status]}>
                    {statusLabels[request.status]}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

