"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { getAvailableWorkflows } from "@/lib/workflow";

// Rol tipleri
export type UserRole = "ORG_ADMIN" | "ORG_VIEWER";

// Kullanıcı bilgileri
export interface AppUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  employeeId: string | null;
  availableWorkflowCodes: string[];
}

// Context tipi
interface UserContextType {
  user: AppUser | null;
  loading: boolean;
  isAdmin: boolean;
  hasRole: (role: UserRole) => boolean;
  refetchUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  hasRole: () => false,
  refetchUser: async () => {},
});

// Hook: Context'i kullanmak için
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};

// Provider Props
interface UserProviderProps {
  children: ReactNode;
}

// Provider Component
export function UserProvider({ children }: UserProviderProps) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (authData?.user) {
      const authUser = authData.user;

      // app_users -> employees ilişkisinden bilgileri çek (role dahil)
      const { data: appUserData } = await supabase
        .from("app_users")
        .select("employee_id, role, employees(first_name, last_name)")
        .eq("id", authUser.id)
        .single();

      const employeeData = appUserData?.employees;
      const employee = Array.isArray(employeeData)
        ? employeeData[0]
        : employeeData;
      const fullName = employee
        ? `${employee.first_name} ${employee.last_name}`
        : authUser.user_metadata?.full_name ||
          authUser.email?.split("@")[0] ||
          "User";

      const employeeId = appUserData?.employee_id || null;

      // Çalışanın başlatabileceği workflow kodlarını al
      const availableWorkflows = employeeId
        ? await getAvailableWorkflows(supabase, employeeId)
        : [];
      const availableWorkflowCodes = availableWorkflows.map((wf) => wf.code);

      setUser({
        id: authUser.id,
        name: fullName,
        email: authUser.email || "",
        avatar: authUser.user_metadata?.avatar_url || "",
        role: (appUserData?.role as UserRole) || "ORG_VIEWER",
        employeeId,
        availableWorkflowCodes,
      });
    } else {
      setUser(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchUser();

    // Auth state değişikliklerini dinle
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUser();
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const hasRole = (role: UserRole): boolean => {
    return user?.role === role;
  };

  const value: UserContextType = {
    user,
    loading,
    isAdmin: user?.role === "ORG_ADMIN",
    hasRole,
    refetchUser: fetchUser,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

