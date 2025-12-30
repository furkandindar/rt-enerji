"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, Bell, Check, CheckCheck } from "lucide-react";
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

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  reference_id: string | null;
}

const notificationTypeColors: Record<string, string> = {
  APPROVAL_REQUIRED: "bg-yellow-500",
  REQUEST_APPROVED: "bg-green-500",
  REQUEST_REJECTED: "bg-red-500",
  REQUEST_CANCELLED: "bg-gray-500",
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await fetch("/api/notifications");
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
      });
      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        setUnreadCount(0);
        toast.success("Tüm bildirimler okundu olarak işaretlendi");
      }
    } catch (error) {
      console.error("Error marking all as read:", error);
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
          <h1 className="text-2xl font-bold tracking-tight">Bildirimler</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} okunmamış bildirim`
              : "Tüm bildirimler okundu"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllAsRead}>
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
              className={notification.is_read ? "opacity-60" : ""}
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
                      onClick={() => markAsRead(notification.id)}
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

