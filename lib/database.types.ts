export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          created_at: string
          email: string
          employee_id: string | null
          id: string
          privacy_accepted_at: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          employee_id?: string | null
          id: string
          privacy_accepted_at?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          employee_id?: string | null
          id?: string
          privacy_accepted_at?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_positions: {
        Row: {
          created_at: string
          employee_id: string
          end_date: string | null
          id: string
          is_primary: boolean
          position_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          end_date?: string | null
          id?: string
          is_primary?: boolean
          position_id: string
          start_date: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          end_date?: string | null
          id?: string
          is_primary?: boolean
          position_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_positions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          email: string | null
          employee_no: string | null
          first_name: string
          hire_date: string | null
          id: string
          last_name: string
          phone: string | null
          status: string
          termination_date: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          employee_no?: string | null
          first_name: string
          hire_date?: string | null
          id?: string
          last_name: string
          phone?: string | null
          status?: string
          termination_date?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          employee_no?: string | null
          first_name?: string
          hire_date?: string | null
          id?: string
          last_name?: string
          phone?: string | null
          status?: string
          termination_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      grade_levels: {
        Row: {
          band: number
          created_at: string
          description: string | null
          display_order: number
          is_active: boolean
          name: string
        }
        Insert: {
          band: number
          created_at?: string
          description?: string | null
          display_order?: number
          is_active?: boolean
          name: string
        }
        Update: {
          band?: number
          created_at?: string
          description?: string | null
          display_order?: number
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      organizational_units: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          order_index: number
          parent_id: string | null
          unit_type_id: string
          updated_at: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          order_index?: number
          parent_id?: string | null
          unit_type_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          parent_id?: string | null
          unit_type_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizational_units_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "organizational_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizational_units_unit_type_id_fkey"
            columns: ["unit_type_id"]
            isOneToOne: false
            referencedRelation: "unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
      position_types: {
        Row: {
          code: string
          color: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_unit_head: boolean
          job_code: string
          level_band: number
          location: string | null
          order_index: number
          position_type_id: string | null
          reports_to_position_id: string | null
          title: string
          unit_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_unit_head?: boolean
          job_code: string
          level_band: number
          location?: string | null
          order_index?: number
          position_type_id?: string | null
          reports_to_position_id?: string | null
          title: string
          unit_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_unit_head?: boolean
          job_code?: string
          level_band?: number
          location?: string | null
          order_index?: number
          position_type_id?: string | null
          reports_to_position_id?: string | null
          title?: string
          unit_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_level_band_fkey"
            columns: ["level_band"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["band"]
          },
          {
            foreignKeyName: "positions_position_type_id_fkey"
            columns: ["position_type_id"]
            isOneToOne: false
            referencedRelation: "position_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_reports_to_position_id_fkey"
            columns: ["reports_to_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "organizational_units"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
