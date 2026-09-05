"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNotificationStore } from "@/lib/stores/notification-store";

const notificationTypeColors: Record<string, string> = {
  APPROVAL_REQUIRED: "bg-yellow-500",
  REQUEST_APPROVED: "bg-green-500",
  REQUEST_REJECTED: "bg-red-500",
  REQUEST_CANCELLED: "bg-gray-500",
  REQUEST_UPDATED: "bg-blue-500",
  REVISION_REQUESTED: "bg-orange-500",
  DELEGATION_ASSIGNED: "bg-violet-500",
  DELEGATION_CANCELLED: "bg-gray-500",
};

export function NotificationPopover() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Zustand store'dan state al
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: storeMarkAsRead,
    markAllAsRead: storeMarkAllAsRead,
  } = useNotificationStore();

  // Tek bildirimi okundu işaretle
  const handleMarkAsRead = async (id: string) => {
    // Optimistic update
    storeMarkAsRead(id);

    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
      });
      if (!response.ok) {
        // Rollback on error - refetch yapılabilir
        toast.error("Bildirim güncellenemedi");
      }
    } catch {
      toast.error("Bildirim güncellenemedi");
    }
  };

  // Tüm bildirimleri okundu işaretle
  const handleMarkAllAsRead = async () => {
    // Optimistic update
    storeMarkAllAsRead();

    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
      if (response.ok) {
        toast.success("Tüm bildirimler okundu olarak işaretlendi");
      } else {
        toast.error("Bildirimler güncellenemedi");
      }
    } catch {
      toast.error("Bildirimler güncellenemedi");
    }
  };

  // Bildirime tıklandığında — V5: tip-bazlı yönlendirme
  const handleNotificationClick = async (
    notificationId: string,
    isRead: boolean,
    type: string,
    referenceId: string | null
  ) => {
    if (!isRead) {
      handleMarkAsRead(notificationId);
    }
    setOpen(false);

    // Talep edene gidenler: request detayı
    const requesterTypes = [
      "REQUEST_APPROVED",
      "REQUEST_REJECTED",
      "REQUEST_CANCELLED",
      "REVISION_REQUESTED",
    ];
    if (referenceId && requesterTypes.includes(type)) {
      router.push(`/my-requests/${referenceId}`);
      return;
    }

    // Vekalet bildirimleri: vekalet kartı profil sayfasında
    if (type === "DELEGATION_ASSIGNED" || type === "DELEGATION_CANCELLED") {
      router.push("/profile");
      return;
    }

    // Onaycıya gidenler (APPROVAL_REQUIRED, REQUEST_UPDATED):
    // reference_id request_id'dir; approval id'sini bilmiyoruz. Onay listesine git.
    router.push("/approvals");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <span className="sr-only">Bildirimler</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h4 className="font-semibold">Bildirimler</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs"
              onClick={handleMarkAllAsRead}
            >
              <CheckCheck className="mr-1 h-3 w-3" />
              Tümünü oku
            </Button>
          )}
        </div>
        <Separator />
        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="mb-2 h-8 w-8" />
              <p className="text-sm">Bildirim yok</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.slice(0, 10).map((notification) => (
                <div
                  key={notification.id}
                  className={`flex gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors ${
                    !notification.is_read ? "bg-muted/30" : ""
                  }`}
                  onClick={() =>
                    handleNotificationClick(
                      notification.id,
                      notification.is_read,
                      notification.type,
                      notification.reference_id
                    )
                  }
                >
                  <div
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      notificationTypeColors[notification.type] || "bg-gray-400"
                    }`}
                  />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {notification.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.created_at), {
                        addSuffix: true,
                        locale: tr,
                      })}
                    </p>
                  </div>
                  {!notification.is_read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation(); // Parent onClick'i tetikleme
                        handleMarkAsRead(notification.id);
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <Separator />
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full justify-center text-sm"
            asChild
            onClick={() => setOpen(false)}
          >
            <Link href="/notifications">Tümünü Gör</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

