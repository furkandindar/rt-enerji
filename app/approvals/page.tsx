"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PendingApproval {
  id: string;
  workflow_step: {
    name: string;
    step_order: number;
  };
  request: {
    id: string;
    current_step: number;
    created_at: string;
    workflow_definition: {
      name: string;
    };
    requester: {
      first_name: string;
      last_name: string;
      employee_no: string;
    };
    leave_request: {
      leave_type: string;
      start_datetime: string;
      end_datetime: string;
      total_days: number;
      reason: string | null;
    };
  };
}

const leaveTypeLabels: Record<string, string> = {
  ANNUAL_LEAVE: "Yıllık İzin",
  SHORT_LEAVE: "Kısa Süreli İzin",
};

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchApprovals();
  }, []);

  const fetchApprovals = async () => {
    try {
      const response = await fetch("/api/approvals");
      if (response.ok) {
        const data = await response.json();
        setApprovals(data);
      }
    } catch (error) {
      console.error("Error fetching approvals:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecision = async () => {
    if (!selectedApproval || !decision) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/approvals/${selectedApproval.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "İşlem başarısız");
      }

      toast.success(decision === "APPROVED" ? "Talep onaylandı" : "Talep reddedildi");
      setSelectedApproval(null);
      setDecision(null);
      setComment("");
      fetchApprovals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bekleyen Onaylar</h1>
        <p className="text-muted-foreground">
          Onayınızı bekleyen talepleri görüntüleyin
        </p>
      </div>

      {approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border rounded-lg">
          <p className="text-muted-foreground">Bekleyen onayınız bulunmuyor</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {approvals.map((approval) => (
            <Card key={approval.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">
                    {leaveTypeLabels[approval.request.leave_request?.leave_type] || "İzin"}
                  </Badge>
                  {/* <span className="text-xs text-muted-foreground">
                    Adım {approval.workflow_step.step_order}
                  </span> */}
                </div>
                <CardTitle className="text-lg">
                  {approval.request.requester?.first_name} {approval.request.requester?.last_name}
                </CardTitle>
                <CardDescription>
                  {approval.request.requester?.employee_no}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Tarih: </span>
                    {approval.request.leave_request?.start_datetime &&
                      format(new Date(approval.request.leave_request.start_datetime), "d MMM", { locale: tr })}
                    {" - "}
                    {approval.request.leave_request?.end_datetime &&
                      format(new Date(approval.request.leave_request.end_datetime), "d MMM yyyy", { locale: tr })}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Süre: </span>
                    {approval.request.leave_request?.total_days} gün
                  </p>
                  {approval.request.leave_request?.reason && (
                    <p>
                      <span className="text-muted-foreground">Açıklama: </span>
                      {approval.request.leave_request.reason}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setSelectedApproval(approval);
                      setDecision("APPROVED");
                    }}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Onayla
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      setSelectedApproval(approval);
                      setDecision("REJECTED");
                    }}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Reddet
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Onay/Red Dialog */}
      <Dialog
        open={selectedApproval !== null && decision !== null}
        onOpenChange={() => {
          setSelectedApproval(null);
          setDecision(null);
          setComment("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "APPROVED" ? "Talebi Onayla" : "Talebi Reddet"}
            </DialogTitle>
            <DialogDescription>
              {selectedApproval?.request.requester?.first_name}{" "}
              {selectedApproval?.request.requester?.last_name} tarafından
              oluşturulan{" "}
              {leaveTypeLabels[selectedApproval?.request.leave_request?.leave_type || ""]}{" "}
              talebini {decision === "APPROVED" ? "onaylamak" : "reddetmek"}{" "}
              üzeresiniz.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="comment">
                Açıklama {decision === "REJECTED" && "(Zorunlu)"}
              </Label>
              <Input
                id="comment"
                placeholder="Açıklama ekleyin..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedApproval(null);
                setDecision(null);
                setComment("");
              }}
            >
              İptal
            </Button>
            <Button
              variant={decision === "APPROVED" ? "default" : "destructive"}
              onClick={handleDecision}
              disabled={isSubmitting || (decision === "REJECTED" && !comment)}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {decision === "APPROVED" ? "Onayla" : "Reddet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

