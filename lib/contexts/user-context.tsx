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
import { can as canWith, toPermissionSet, type Permission } from "@/lib/auth/permissions";

// Rol kodu (app_roles.code). Yetki kararı rol adıyla değil izinle verilir: can("...").
export type UserRole = "SUPER_ADMIN" | "ORG_ADMIN" | "ORG_MANAGER" | "ORG_IT" | "ORG_VIEWER" | "NONE";

// Kullanıcı bilgileri
export interface AppUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  /** Rolün görünen adı (Admin, Yönetici, Kullanıcı). */
  roleLabel: string;
  /** Rolün izinleri (DB role_permissions — public.my_access()). */
  permissions: ReadonlySet<Permission>;
  /** Aktif birim amiri pozisyonu var → Müdür (birimindeki talepleri görür). */
  isUnitManager: boolean;
  employeeId: string | null;
  availableWorkflowCodes: string[];
  privacyAccepted: boolean;
}

// Context tipi
interface UserContextType {
  user: AppUser | null;
  loading: boolean;
  /** Oturumdaki kullanıcı bu izne sahip mi (yüklenirken false). */
  can: (permission: Permission) => boolean;
  isUnitManager: boolean;
  refetchUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  can: () => false,
  isUnitManager: false,
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

      // app_users -> employees (ad, KVKK onayı) + erişim özeti (rol, izinler, Müdür)
      const [{ data: appUserData }, { data: accessData }] = await Promise.all([
        supabase
          .from("app_users")
          .select("employee_id, role, privacy_accepted_at, employees(first_name, last_name)")
          .eq("id", authUser.id)
          .single(),
        supabase.rpc("my_access"),
      ]);
      const access = (accessData ?? {}) as {
        role?: string;
        role_label?: string;
        permissions?: unknown;
        is_unit_manager?: boolean;
      };
      const permissions = toPermissionSet(access.permissions);

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
      const userRole = ((access.role ?? appUserData?.role) as UserRole) || "ORG_VIEWER";

      // Çalışanın başlatabileceği workflow kodlarını al
      // workflows.start_any (Admin, Yönetici) tüm workflow'ları görebilir
      const availableWorkflows = employeeId
        ? await getAvailableWorkflows(supabase, employeeId, permissions.has("workflows.start_any"))
        : [];
      const availableWorkflowCodes = availableWorkflows.map((wf) => wf.code);

      setUser({
        id: authUser.id,
        name: fullName,
        email: authUser.email || "",
        avatar: authUser.user_metadata?.avatar_url || "",
        role: userRole,
        roleLabel: access.role_label ?? "",
        permissions,
        isUnitManager: access.is_unit_manager === true,
        employeeId,
        availableWorkflowCodes,
        privacyAccepted: !!appUserData?.privacy_accepted_at,
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

  const value: UserContextType = {
    user,
    loading,
    can: (permission: Permission) => canWith(user, permission),
    isUnitManager: user?.isUnitManager ?? false,
    refetchUser: fetchUser,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

