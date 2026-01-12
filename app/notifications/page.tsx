"use client";

import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, Bell, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNotificationStore } from "@/lib/stores/notification-store";

const notificationTypeColors: Record<string, string> = {
  APPROVAL_REQUIRED: "bg-yellow-500",
  REQUEST_APPROVED: "bg-green-500",
  REQUEST_REJECTED: "bg-red-500",
  REQUEST_CANCELLED: "bg-gray-500",
};

export default function NotificationsPage() {
  const router = useRouter();

  // Zustand store'dan state al
  const {
    notifications,
    unreadCount,
    isLoading,
    isInitialized,
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
        toast.error("Bildirim güncellenemedi");
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
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
    } catch (error) {
      console.error("Error marking all as read:", error);
      toast.error("Bildirimler güncellenemedi");
    }
  };

  // Bildirime tıklandığında
  const handleNotificationClick = async (notificationId: string, isRead: boolean) => {
    // Okunmamışsa okundu işaretle
    if (!isRead) {
      handleMarkAsRead(notificationId);
    }
    // Approvals sayfasına git
    router.push("/approvals");
  };

  if (isLoading || !isInitialized) {
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
          <h1 className="text-2xl font-bold tracking-tight">Bildirimler</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} okunmamış bildirim`
              : "Tüm bildirimler okundu"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAllAsRead}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Tümünü Okundu İşaretle
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border rounded-lg">
          <Bell className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Henüz bildiriminiz yok</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                notification.is_read ? "opacity-60" : ""
              }`}
              onClick={() => handleNotificationClick(notification.id, notification.is_read)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        notificationTypeColors[notification.type] || "bg-gray-400"
                      }`}
                    />
                    <CardTitle className="text-base">{notification.title}</CardTitle>
                  </div>
                  {!notification.is_read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(notification.id);
                      }}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <CardDescription>
                  {formatDistanceToNow(new Date(notification.created_at), {
                    addSuffix: true,
                    locale: tr,
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{notification.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

