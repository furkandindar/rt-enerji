// Notification Store - Zustand
// Global notification state yönetimi

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type:
    | 'APPROVAL_REQUIRED'
    | 'REQUEST_APPROVED'
    | 'REQUEST_REJECTED'
    | 'REQUEST_CANCELLED'
    | 'REQUEST_UPDATED'
    | 'REVISION_REQUESTED';
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationState {
  // State
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  updateNotification: (id: string, updates: Partial<Notification>) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  reset: () => void;
}

// ============================================================================
// Store
// ============================================================================

const initialState = {
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isInitialized: false,
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  ...initialState,

  setNotifications: (notifications) => {
    const unreadCount = notifications.filter((n) => !n.is_read).length;
    set({ notifications, unreadCount });
  },

  addNotification: (notification) => {
    set((state) => {
      // Duplicate kontrolü
      if (state.notifications.some((n) => n.id === notification.id)) {
        return state;
      }
      const newNotifications = [notification, ...state.notifications];
      const unreadCount = newNotifications.filter((n) => !n.is_read).length;
      return { notifications: newNotifications, unreadCount };
    });
  },

  updateNotification: (id, updates) => {
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, ...updates } : n
      );
      const unreadCount = notifications.filter((n) => !n.is_read).length;
      return { notifications, unreadCount };
    });
  },

  removeNotification: (id) => {
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      const unreadCount = notifications.filter((n) => !n.is_read).length;
      return { notifications, unreadCount };
    });
  },

  markAsRead: (id) => {
    get().updateNotification(id, { is_read: true });
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));
  },

  setLoading: (isLoading) => set({ isLoading }),

  setInitialized: (isInitialized) => set({ isInitialized }),

  reset: () => set(initialState),
}));

