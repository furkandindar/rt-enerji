// useNotificationSubscription Hook
// Supabase Realtime ile notifications tablosunu dinler

"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useNotificationStore, Notification } from "@/lib/stores/notification-store";
import { RealtimeChannel } from "@supabase/supabase-js";

export function useNotificationSubscription(userId: string | null) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef(createClient());
  
  const {
    setNotifications,
    addNotification,
    updateNotification,
    removeNotification,
    setLoading,
    setInitialized,
    isInitialized,
  } = useNotificationStore();

  // İlk yüklemede bildirimleri çek
  const fetchNotifications = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const { data, error } = await supabaseRef.current
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error fetching notifications:", error);
        return;
      }

      setNotifications(data || []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [userId, setNotifications, setLoading, setInitialized]);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;

    // İlk yüklemede bildirimleri çek
    if (!isInitialized) {
      fetchNotifications();
    }

    // Realtime channel oluştur
    const channel = supabaseRef.current
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("New notification:", payload.new);
          addNotification(payload.new as Notification);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("Notification updated:", payload.new);
          const updated = payload.new as Notification;
          updateNotification(updated.id, updated);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("Notification deleted:", payload.old);
          const deleted = payload.old as { id: string };
          removeNotification(deleted.id);
        }
      )
      .subscribe((status) => {
        console.log("Notification subscription status:", status);
      });

    channelRef.current = channel;

    // Cleanup
    return () => {
      if (channelRef.current) {
        supabaseRef.current.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, isInitialized, fetchNotifications, addNotification, updateNotification, removeNotification]);

  // Refetch function (manuel yenileme için)
  const refetch = useCallback(() => {
    setInitialized(false);
    fetchNotifications();
  }, [fetchNotifications, setInitialized]);

  return { refetch };
}

