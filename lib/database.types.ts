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
      accounting_approval_cover_items: {
        Row: {
          accounting_request_id: string
          capacity_type: Database["public"]["Enums"]["accounting_capacity_type"]
          company_name: string
          created_at: string
          id: string
          invoice_amount: number
          item_date: string
          item_subject: string
          payable_amount: number
          payee_name: string
          row_order: number
        }
        Insert: {
          accounting_request_id: string
          capacity_type: Database["public"]["Enums"]["accounting_capacity_type"]
          company_name: string
          created_at?: string
          id?: string
          invoice_amount: number
          item_date: string
          item_subject: string
          payable_amount: number
          payee_name: string
          row_order: number
        }
        Update: {
          accounting_request_id?: string
          capacity_type?: Database["public"]["Enums"]["accounting_capacity_type"]
          company_name?: string
          created_at?: string
          id?: string
          invoice_amount?: number
          item_date?: string
          item_subject?: string
          payable_amount?: number
          payee_name?: string
          row_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounting_approval_cover_items_accounting_request_id_fkey"
            columns: ["accounting_request_id"]
            isOneToOne: false
            referencedRelation: "accounting_approval_cover_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_approval_cover_requests: {
        Row: {
          created_at: string
          demirbas_registered: boolean
          document_no: string
          has_accounting_prog_entry: boolean
          has_arvento_record: boolean
          has_delivery_info: boolean
          has_dispatch_note: boolean
          has_invoice_record: boolean
          id: string
          paid_from_credit: boolean
          request_date: string
          request_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          demirbas_registered: boolean
          document_no: string
          has_accounting_prog_entry: boolean
          has_arvento_record: boolean
          has_delivery_info: boolean
          has_dispatch_note: boolean
          has_invoice_record: boolean
          id?: string
          paid_from_credit: boolean
          request_date?: string
          request_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          demirbas_registered?: boolean
          document_no?: string
          has_accounting_prog_entry?: boolean
          has_arvento_record?: boolean
          has_delivery_info?: boolean
          has_dispatch_note?: boolean
          has_invoice_record?: boolean
          id?: string
          paid_from_credit?: boolean
          request_date?: string
          request_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_approval_cover_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
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
      approval_letter_requests: {
        Row: {
          agreement_amount: string | null
          company: string
          comparison_approval_date: string | null
          content: string
          created_at: string | null
          has_contract: boolean | null
          has_payment_table: boolean | null
          id: string
          letter_date: string
          paid_amounts: Json | null
          project: string
          remaining_after_payment: string | null
          remaining_payment: string | null
          request_id: string
          requested_payment_amount: string | null
          subject: string
          updated_at: string | null
        }
        Insert: {
          agreement_amount?: string | null
          company: string
          comparison_approval_date?: string | null
          content: string
          created_at?: string | null
          has_contract?: boolean | null
          has_payment_table?: boolean | null
          id?: string
          letter_date: string
          paid_amounts?: Json | null
          project: string
          remaining_after_payment?: string | null
          remaining_payment?: string | null
          request_id: string
          requested_payment_amount?: string | null
          subject: string
          updated_at?: string | null
        }
        Update: {
          agreement_amount?: string | null
          company?: string
          comparison_approval_date?: string | null
          content?: string
          created_at?: string | null
          has_contract?: boolean | null
          has_payment_table?: boolean | null
          id?: string
          letter_date?: string
          paid_amounts?: Json | null
          project?: string
          remaining_after_payment?: string | null
          remaining_payment?: string | null
          request_id?: string
          requested_payment_amount?: string | null
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_letter_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
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
          signature_font: string | null
          signature_path: string | null
          signature_text: string | null
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
          signature_font?: string | null
          signature_path?: string | null
          signature_text?: string | null
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
          signature_font?: string | null
          signature_path?: string | null
          signature_text?: string | null
          status?: string
          termination_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      expense_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          document_no: string | null
          expense_request_id: string
          id: string
          item_date: string
          row_order: number
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          document_no?: string | null
          expense_request_id: string
          id?: string
          item_date: string
          row_order: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          document_no?: string | null
          expense_request_id?: string
          id?: string
          item_date?: string
          row_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_items_expense_request_id_fkey"
            columns: ["expense_request_id"]
            isOneToOne: false
            referencedRelation: "expense_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_requests: {
        Row: {
          advance_amount: number | null
          created_at: string
          id: string
          is_travel: boolean
          project_code: string
          project_name: string
          request_date: string
          request_id: string
          travel_date: string | null
          travel_duration: string | null
          travel_person_count: number | null
          updated_at: string
          work_or_destination: string
        }
        Insert: {
          advance_amount?: number | null
          created_at?: string
          id?: string
          is_travel?: boolean
          project_code: string
          project_name: string
          request_date?: string
          request_id: string
          travel_date?: string | null
          travel_duration?: string | null
          travel_person_count?: number | null
          updated_at?: string
          work_or_destination: string
        }
        Update: {
          advance_amount?: number | null
          created_at?: string
          id?: string
          is_travel?: boolean
          project_code?: string
          project_name?: string
          request_date?: string
          request_id?: string
          travel_date?: string | null
          travel_duration?: string | null
          travel_person_count?: number | null
          updated_at?: string
          work_or_destination?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_approval_cover_items: {
        Row: {
          company_name: string
          created_at: string
          finance_request_id: string
          id: string
          invoice_amount: number
          item_date: string
          item_subject: string
          payable_amount: number
          payee_name: string
          row_order: number
        }
        Insert: {
          company_name: string
          created_at?: string
          finance_request_id: string
          id?: string
          invoice_amount: number
          item_date: string
          item_subject: string
          payable_amount: number
          payee_name: string
          row_order: number
        }
        Update: {
          company_name?: string
          created_at?: string
          finance_request_id?: string
          id?: string
          invoice_amount?: number
          item_date?: string
          item_subject?: string
          payable_amount?: number
          payee_name?: string
          row_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_approval_cover_items_finance_request_id_fkey"
            columns: ["finance_request_id"]
            isOneToOne: false
            referencedRelation: "finance_approval_cover_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_approval_cover_requests: {
        Row: {
          account_available: boolean
          cash_flow_recorded: boolean
          created_at: string
          document_no: string
          expense_area: Database["public"]["Enums"]["finance_expense_area"]
          funding_source: Database["public"]["Enums"]["finance_funding_source"]
          has_rt_enerji_proforma: boolean
          id: string
          request_date: string
          request_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          account_available: boolean
          cash_flow_recorded: boolean
          created_at?: string
          document_no: string
          expense_area: Database["public"]["Enums"]["finance_expense_area"]
          funding_source: Database["public"]["Enums"]["finance_funding_source"]
          has_rt_enerji_proforma: boolean
          id?: string
          request_date?: string
          request_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          account_available?: boolean
          cash_flow_recorded?: boolean
          created_at?: string
          document_no?: string
          expense_area?: Database["public"]["Enums"]["finance_expense_area"]
          funding_source?: Database["public"]["Enums"]["finance_funding_source"]
          has_rt_enerji_proforma?: boolean
          id?: string
          request_date?: string
          request_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_approval_cover_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
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
      leave_requests: {
        Row: {
          address_during_leave: string | null
          created_at: string
          end_datetime: string
          hr_note: string | null
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          overtime_amount: number | null
          reason: string | null
          remaining_days: number | null
          request_id: string
          start_datetime: string
          total_days: number | null
          updated_at: string | null
        }
        Insert: {
          address_during_leave?: string | null
          created_at?: string
          end_datetime: string
          hr_note?: string | null
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          overtime_amount?: number | null
          reason?: string | null
          remaining_days?: number | null
          request_id: string
          start_datetime: string
          total_days?: number | null
          updated_at?: string | null
        }
        Update: {
          address_during_leave?: string | null
          created_at?: string
          end_datetime?: string
          hr_note?: string | null
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          overtime_amount?: number | null
          reason?: string | null
          remaining_days?: number | null
          request_id?: string
          start_datetime?: string
          total_days?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      mukayese_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          mukayese_request_id: string
          quantity: number | null
          row_order: number
          row_type: Database["public"]["Enums"]["mukayese_row_type"]
          unit: Database["public"]["Enums"]["mukayese_unit"] | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          mukayese_request_id: string
          quantity?: number | null
          row_order: number
          row_type?: Database["public"]["Enums"]["mukayese_row_type"]
          unit?: Database["public"]["Enums"]["mukayese_unit"] | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          mukayese_request_id?: string
          quantity?: number | null
          row_order?: number
          row_type?: Database["public"]["Enums"]["mukayese_row_type"]
          unit?: Database["public"]["Enums"]["mukayese_unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "mukayese_items_mukayese_request_id_fkey"
            columns: ["mukayese_request_id"]
            isOneToOne: false
            referencedRelation: "mukayese_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      mukayese_prices: {
        Row: {
          created_at: string
          id: string
          mukayese_item_id: string
          mukayese_supplier_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          mukayese_item_id: string
          mukayese_supplier_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          mukayese_item_id?: string
          mukayese_supplier_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "mukayese_prices_mukayese_item_id_fkey"
            columns: ["mukayese_item_id"]
            isOneToOne: false
            referencedRelation: "mukayese_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mukayese_prices_mukayese_supplier_id_fkey"
            columns: ["mukayese_supplier_id"]
            isOneToOne: false
            referencedRelation: "mukayese_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      mukayese_requests: {
        Row: {
          company: string
          created_at: string
          form_currency: Database["public"]["Enums"]["mukayese_currency"]
          form_date: string
          fx_eur_try: number | null
          fx_eur_usd: number | null
          fx_snapshot_at: string | null
          fx_usd_try: number | null
          id: string
          kdv_rate: number
          notes: string | null
          preparer_full_name: string
          project_title: string
          request_amount_text: string
          request_content: string
          request_id: string
          request_reason: string
          subject: string
          updated_at: string
        }
        Insert: {
          company: string
          created_at?: string
          form_currency: Database["public"]["Enums"]["mukayese_currency"]
          form_date?: string
          fx_eur_try?: number | null
          fx_eur_usd?: number | null
          fx_snapshot_at?: string | null
          fx_usd_try?: number | null
          id?: string
          kdv_rate?: number
          notes?: string | null
          preparer_full_name: string
          project_title: string
          request_amount_text: string
          request_content: string
          request_id: string
          request_reason: string
          subject: string
          updated_at?: string
        }
        Update: {
          company?: string
          created_at?: string
          form_currency?: Database["public"]["Enums"]["mukayese_currency"]
          form_date?: string
          fx_eur_try?: number | null
          fx_eur_usd?: number | null
          fx_snapshot_at?: string | null
          fx_usd_try?: number | null
          id?: string
          kdv_rate?: number
          notes?: string | null
          preparer_full_name?: string
          project_title?: string
          request_amount_text?: string
          request_content?: string
          request_id?: string
          request_reason?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mukayese_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      mukayese_suppliers: {
        Row: {
          column_order: number
          company_name: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          delivery_time: string | null
          id: string
          mukayese_request_id: string
          payment_terms: string | null
          technical_description: string | null
        }
        Insert: {
          column_order: number
          company_name: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_time?: string | null
          id?: string
          mukayese_request_id: string
          payment_terms?: string | null
          technical_description?: string | null
        }
        Update: {
          column_order?: number
          company_name?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_time?: string | null
          id?: string
          mukayese_request_id?: string
          payment_terms?: string | null
          technical_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mukayese_suppliers_mukayese_request_id_fkey"
            columns: ["mukayese_request_id"]
            isOneToOne: false
            referencedRelation: "mukayese_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          reference_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          reference_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      onboarding_requests: {
        Row: {
          computer_setup_notes: string | null
          computer_setup_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          contact_info_notes: string | null
          contact_info_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          contract_signature_notes: string | null
          contract_signature_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          created_at: string | null
          department: string | null
          desk_cabinet_notes: string | null
          desk_cabinet_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          documents_upload_notes: string | null
          documents_upload_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          employee_name: string | null
          employee_title: string | null
          employment_period: string | null
          entry_registration_notes: string | null
          entry_registration_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          evaluation_calendar_notes: string | null
          evaluation_calendar_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          exit_reason_check_notes: string | null
          exit_reason_check_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          guidelines_delivery_notes: string | null
          guidelines_delivery_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          hiring_announcement_notes: string | null
          hiring_announcement_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          hospital_notification_notes: string | null
          hospital_notification_status: string | null
          hospital_rights_notification_notes: string | null
          hospital_rights_notification_status: string | null
          id: string
          job_description: string | null
          location: string | null
          mail_groups_notes: string | null
          mail_groups_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          mail_setup_notes: string | null
          mail_setup_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          org_chart_notes: string | null
          org_chart_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          pdks_card_notes: string | null
          pdks_card_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          phone_setup_notes: string | null
          phone_setup_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          qnap_o365_ip_notes: string | null
          qnap_o365_ip_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          reporting_manager: string | null
          request_id: string
          s4_guidelines_delivery_notes: string | null
          s4_guidelines_delivery_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          safety_instructions_notes: string | null
          safety_instructions_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          sgk_iskur_notification_notes: string | null
          sgk_iskur_notification_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          sgk_verification_notes: string | null
          sgk_verification_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          smoking_info_notes: string | null
          smoking_info_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          start_date: string | null
          stationery_request_notes: string | null
          stationery_request_status:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          updated_at: string | null
        }
        Insert: {
          computer_setup_notes?: string | null
          computer_setup_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          contact_info_notes?: string | null
          contact_info_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          contract_signature_notes?: string | null
          contract_signature_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          created_at?: string | null
          department?: string | null
          desk_cabinet_notes?: string | null
          desk_cabinet_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          documents_upload_notes?: string | null
          documents_upload_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          employee_name?: string | null
          employee_title?: string | null
          employment_period?: string | null
          entry_registration_notes?: string | null
          entry_registration_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          evaluation_calendar_notes?: string | null
          evaluation_calendar_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          exit_reason_check_notes?: string | null
          exit_reason_check_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          guidelines_delivery_notes?: string | null
          guidelines_delivery_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          hiring_announcement_notes?: string | null
          hiring_announcement_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          hospital_notification_notes?: string | null
          hospital_notification_status?: string | null
          hospital_rights_notification_notes?: string | null
          hospital_rights_notification_status?: string | null
          id?: string
          job_description?: string | null
          location?: string | null
          mail_groups_notes?: string | null
          mail_groups_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          mail_setup_notes?: string | null
          mail_setup_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          org_chart_notes?: string | null
          org_chart_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          pdks_card_notes?: string | null
          pdks_card_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          phone_setup_notes?: string | null
          phone_setup_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          qnap_o365_ip_notes?: string | null
          qnap_o365_ip_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          reporting_manager?: string | null
          request_id: string
          s4_guidelines_delivery_notes?: string | null
          s4_guidelines_delivery_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          safety_instructions_notes?: string | null
          safety_instructions_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          sgk_iskur_notification_notes?: string | null
          sgk_iskur_notification_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          sgk_verification_notes?: string | null
          sgk_verification_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          smoking_info_notes?: string | null
          smoking_info_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          start_date?: string | null
          stationery_request_notes?: string | null
          stationery_request_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          updated_at?: string | null
        }
        Update: {
          computer_setup_notes?: string | null
          computer_setup_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          contact_info_notes?: string | null
          contact_info_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          contract_signature_notes?: string | null
          contract_signature_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          created_at?: string | null
          department?: string | null
          desk_cabinet_notes?: string | null
          desk_cabinet_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          documents_upload_notes?: string | null
          documents_upload_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          employee_name?: string | null
          employee_title?: string | null
          employment_period?: string | null
          entry_registration_notes?: string | null
          entry_registration_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          evaluation_calendar_notes?: string | null
          evaluation_calendar_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          exit_reason_check_notes?: string | null
          exit_reason_check_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          guidelines_delivery_notes?: string | null
          guidelines_delivery_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          hiring_announcement_notes?: string | null
          hiring_announcement_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          hospital_notification_notes?: string | null
          hospital_notification_status?: string | null
          hospital_rights_notification_notes?: string | null
          hospital_rights_notification_status?: string | null
          id?: string
          job_description?: string | null
          location?: string | null
          mail_groups_notes?: string | null
          mail_groups_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          mail_setup_notes?: string | null
          mail_setup_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          org_chart_notes?: string | null
          org_chart_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          pdks_card_notes?: string | null
          pdks_card_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          phone_setup_notes?: string | null
          phone_setup_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          qnap_o365_ip_notes?: string | null
          qnap_o365_ip_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          reporting_manager?: string | null
          request_id?: string
          s4_guidelines_delivery_notes?: string | null
          s4_guidelines_delivery_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          safety_instructions_notes?: string | null
          safety_instructions_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          sgk_iskur_notification_notes?: string | null
          sgk_iskur_notification_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          sgk_verification_notes?: string | null
          sgk_verification_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          smoking_info_notes?: string | null
          smoking_info_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          start_date?: string | null
          stationery_request_notes?: string | null
          stationery_request_status?:
            | Database["public"]["Enums"]["checklist_status"]
            | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
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
      overtime_entries: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          overtime_hours: number
          overtime_pay: number
          overtime_request_id: string
          role_title: string
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          overtime_hours: number
          overtime_pay: number
          overtime_request_id: string
          role_title: string
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          overtime_hours?: number
          overtime_pay?: number
          overtime_request_id?: string
          role_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_entries_overtime_request_id_fkey"
            columns: ["overtime_request_id"]
            isOneToOne: false
            referencedRelation: "overtime_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_requests: {
        Row: {
          created_at: string | null
          hr_note: string | null
          id: string
          month: string
          next_shift: string | null
          next_shift_end: string | null
          next_shift_start: string | null
          overtime_type: Database["public"]["Enums"]["overtime_type"]
          previous_shift: string | null
          previous_shift_end: string | null
          previous_shift_start: string | null
          reason_category: Database["public"]["Enums"]["overtime_reason_category"]
          reason_detail: string
          request_id: string
          total_hours: number | null
          total_pay: number | null
          updated_at: string | null
          work_end_date: string | null
          work_location: string | null
          work_reason: string | null
          work_start_date: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          hr_note?: string | null
          id?: string
          month: string
          next_shift?: string | null
          next_shift_end?: string | null
          next_shift_start?: string | null
          overtime_type: Database["public"]["Enums"]["overtime_type"]
          previous_shift?: string | null
          previous_shift_end?: string | null
          previous_shift_start?: string | null
          reason_category: Database["public"]["Enums"]["overtime_reason_category"]
          reason_detail: string
          request_id: string
          total_hours?: number | null
          total_pay?: number | null
          updated_at?: string | null
          work_end_date?: string | null
          work_location?: string | null
          work_reason?: string | null
          work_start_date?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          hr_note?: string | null
          id?: string
          month?: string
          next_shift?: string | null
          next_shift_end?: string | null
          next_shift_start?: string | null
          overtime_type?: Database["public"]["Enums"]["overtime_type"]
          previous_shift?: string | null
          previous_shift_end?: string | null
          previous_shift_start?: string | null
          reason_category?: Database["public"]["Enums"]["overtime_reason_category"]
          reason_detail?: string
          request_id?: string
          total_hours?: number | null
          total_pay?: number | null
          updated_at?: string | null
          work_end_date?: string | null
          work_location?: string | null
          work_reason?: string | null
          work_start_date?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "overtime_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
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
      request_approvals: {
        Row: {
          approver_employee_id: string
          comment: string | null
          created_at: string
          decided_at: string | null
          id: string
          request_id: string
          sequence_order: number
          status: Database["public"]["Enums"]["approval_status"]
          workflow_step_id: string
        }
        Insert: {
          approver_employee_id: string
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          request_id: string
          sequence_order: number
          status?: Database["public"]["Enums"]["approval_status"]
          workflow_step_id: string
        }
        Update: {
          approver_employee_id?: string
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          request_id?: string
          sequence_order?: number
          status?: Database["public"]["Enums"]["approval_status"]
          workflow_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_approvals_approver_employee_id_fkey"
            columns: ["approver_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_approvals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_approvals_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      request_attachments: {
        Row: {
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          request_id: string
          step_attachment_config_id: string
          uploaded_at: string | null
          uploaded_by: string
        }
        Insert: {
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          request_id: string
          step_attachment_config_id: string
          uploaded_at?: string | null
          uploaded_by: string
        }
        Update: {
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          request_id?: string
          step_attachment_config_id?: string
          uploaded_at?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachments_step_attachment_config_id_fkey"
            columns: ["step_attachment_config_id"]
            isOneToOne: false
            referencedRelation: "workflow_step_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      request_form_requests: {
        Row: {
          amount: number | null
          company: string
          content: string
          created_at: string | null
          id: string
          quantity: string | null
          reason: string | null
          request_date: string
          request_id: string
          request_type: string
          requester_name: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          company: string
          content: string
          created_at?: string | null
          id?: string
          quantity?: string | null
          reason?: string | null
          request_date?: string
          request_id: string
          request_type: string
          requester_name: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          company?: string
          content?: string
          created_at?: string | null
          id?: string
          quantity?: string | null
          reason?: string | null
          request_date?: string
          request_id?: string
          request_type?: string
          requester_name?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_form_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          id: string
          parent_request_id: string | null
          pdf_path: string | null
          request_no: string
          requester_employee_id: string
          status: Database["public"]["Enums"]["request_status"]
          submitted_at: string | null
          updated_at: string | null
          workflow_definition_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          parent_request_id?: string | null
          pdf_path?: string | null
          request_no?: string
          requester_employee_id: string
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
          updated_at?: string | null
          workflow_definition_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          parent_request_id?: string | null
          pdf_path?: string | null
          request_no?: string
          requester_employee_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
          updated_at?: string | null
          workflow_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_parent_request_id_fkey"
            columns: ["parent_request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_requester_employee_id_fkey"
            columns: ["requester_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_advance_requests: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          payment_method: string
          request_id: string
          salary_deduction_consent: boolean | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          payment_method: string
          request_id: string
          salary_deduction_consent?: boolean | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          payment_method?: string
          request_id?: string
          salary_deduction_consent?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_advance_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      separation_requests: {
        Row: {
          access_card_return_notes: string | null
          access_card_return_status: string | null
          accounting_advance_check_notes: string | null
          accounting_advance_check_status: string | null
          advance_check_notes: string | null
          advance_check_status: string | null
          annual_leave_amount: number | null
          annual_leave_days: number | null
          bank_institution_access_revocation_notes: string | null
          bank_institution_access_revocation_status: string | null
          created_at: string | null
          department: string | null
          documents_scan_notes: string | null
          documents_scan_status: string | null
          email_closure_notes: string | null
          email_closure_status: string | null
          employee_name: string | null
          employee_title: string | null
          employment_period: string | null
          equipment_return_notes: string | null
          equipment_return_status: string | null
          evaluation_calendar_removal_notes: string | null
          evaluation_calendar_removal_status: string | null
          exit_documents_notes: string | null
          exit_documents_status: string | null
          expense_form_review_notes: string | null
          expense_form_review_status: string | null
          expense_form_submission_notes: string | null
          expense_form_submission_status: string | null
          hospital_removal_notes: string | null
          hospital_removal_status: string | null
          id: string
          it_access_revocation_notes: string | null
          it_access_revocation_status: string | null
          job_description: string | null
          legal_equipment_return_notes: string | null
          legal_equipment_return_status: string | null
          location: string | null
          mersis_revocation_notes: string | null
          mersis_revocation_status: string | null
          notice_amount: number | null
          notice_weeks: number | null
          org_chart_removal_notes: string | null
          org_chart_removal_status: string | null
          payroll_processing_notes: string | null
          payroll_processing_status: string | null
          pc_check_notes: string | null
          pc_check_status: string | null
          personnel_list_removal_notes: string | null
          personnel_list_removal_status: string | null
          poa_uyap_revocation_notes: string | null
          poa_uyap_revocation_status: string | null
          qnap_o365_ip_removal_notes: string | null
          qnap_o365_ip_removal_status: string | null
          reporting_manager: string | null
          request_id: string
          security_notification_notes: string | null
          security_notification_status: string | null
          separation_date: string | null
          separation_reason: string | null
          severance_amount: number | null
          severance_days: number | null
          sgk_notification_notes: string | null
          sgk_notification_status: string | null
          uniform_return_notes: string | null
          uniform_return_status: string | null
          updated_at: string | null
        }
        Insert: {
          access_card_return_notes?: string | null
          access_card_return_status?: string | null
          accounting_advance_check_notes?: string | null
          accounting_advance_check_status?: string | null
          advance_check_notes?: string | null
          advance_check_status?: string | null
          annual_leave_amount?: number | null
          annual_leave_days?: number | null
          bank_institution_access_revocation_notes?: string | null
          bank_institution_access_revocation_status?: string | null
          created_at?: string | null
          department?: string | null
          documents_scan_notes?: string | null
          documents_scan_status?: string | null
          email_closure_notes?: string | null
          email_closure_status?: string | null
          employee_name?: string | null
          employee_title?: string | null
          employment_period?: string | null
          equipment_return_notes?: string | null
          equipment_return_status?: string | null
          evaluation_calendar_removal_notes?: string | null
          evaluation_calendar_removal_status?: string | null
          exit_documents_notes?: string | null
          exit_documents_status?: string | null
          expense_form_review_notes?: string | null
          expense_form_review_status?: string | null
          expense_form_submission_notes?: string | null
          expense_form_submission_status?: string | null
          hospital_removal_notes?: string | null
          hospital_removal_status?: string | null
          id?: string
          it_access_revocation_notes?: string | null
          it_access_revocation_status?: string | null
          job_description?: string | null
          legal_equipment_return_notes?: string | null
          legal_equipment_return_status?: string | null
          location?: string | null
          mersis_revocation_notes?: string | null
          mersis_revocation_status?: string | null
          notice_amount?: number | null
          notice_weeks?: number | null
          org_chart_removal_notes?: string | null
          org_chart_removal_status?: string | null
          payroll_processing_notes?: string | null
          payroll_processing_status?: string | null
          pc_check_notes?: string | null
          pc_check_status?: string | null
          personnel_list_removal_notes?: string | null
          personnel_list_removal_status?: string | null
          poa_uyap_revocation_notes?: string | null
          poa_uyap_revocation_status?: string | null
          qnap_o365_ip_removal_notes?: string | null
          qnap_o365_ip_removal_status?: string | null
          reporting_manager?: string | null
          request_id: string
          security_notification_notes?: string | null
          security_notification_status?: string | null
          separation_date?: string | null
          separation_reason?: string | null
          severance_amount?: number | null
          severance_days?: number | null
          sgk_notification_notes?: string | null
          sgk_notification_status?: string | null
          uniform_return_notes?: string | null
          uniform_return_status?: string | null
          updated_at?: string | null
        }
        Update: {
          access_card_return_notes?: string | null
          access_card_return_status?: string | null
          accounting_advance_check_notes?: string | null
          accounting_advance_check_status?: string | null
          advance_check_notes?: string | null
          advance_check_status?: string | null
          annual_leave_amount?: number | null
          annual_leave_days?: number | null
          bank_institution_access_revocation_notes?: string | null
          bank_institution_access_revocation_status?: string | null
          created_at?: string | null
          department?: string | null
          documents_scan_notes?: string | null
          documents_scan_status?: string | null
          email_closure_notes?: string | null
          email_closure_status?: string | null
          employee_name?: string | null
          employee_title?: string | null
          employment_period?: string | null
          equipment_return_notes?: string | null
          equipment_return_status?: string | null
          evaluation_calendar_removal_notes?: string | null
          evaluation_calendar_removal_status?: string | null
          exit_documents_notes?: string | null
          exit_documents_status?: string | null
          expense_form_review_notes?: string | null
          expense_form_review_status?: string | null
          expense_form_submission_notes?: string | null
          expense_form_submission_status?: string | null
          hospital_removal_notes?: string | null
          hospital_removal_status?: string | null
          id?: string
          it_access_revocation_notes?: string | null
          it_access_revocation_status?: string | null
          job_description?: string | null
          legal_equipment_return_notes?: string | null
          legal_equipment_return_status?: string | null
          location?: string | null
          mersis_revocation_notes?: string | null
          mersis_revocation_status?: string | null
          notice_amount?: number | null
          notice_weeks?: number | null
          org_chart_removal_notes?: string | null
          org_chart_removal_status?: string | null
          payroll_processing_notes?: string | null
          payroll_processing_status?: string | null
          pc_check_notes?: string | null
          pc_check_status?: string | null
          personnel_list_removal_notes?: string | null
          personnel_list_removal_status?: string | null
          poa_uyap_revocation_notes?: string | null
          poa_uyap_revocation_status?: string | null
          qnap_o365_ip_removal_notes?: string | null
          qnap_o365_ip_removal_status?: string | null
          reporting_manager?: string | null
          request_id?: string
          security_notification_notes?: string | null
          security_notification_status?: string | null
          separation_date?: string | null
          separation_reason?: string | null
          severance_amount?: number | null
          severance_days?: number | null
          sgk_notification_notes?: string | null
          sgk_notification_status?: string | null
          uniform_return_notes?: string | null
          uniform_return_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "separation_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      stamp_requests: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          original_pdf_path: string
          request_id: string
          selected_pages: string
          stamp_id: string
          stamp_position: string
          stamp_position_overrides: Json | null
          stamp_x_ratio: number | null
          stamp_y_ratio: number | null
          stamped_pdf_path: string | null
          subject: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          original_pdf_path: string
          request_id: string
          selected_pages?: string
          stamp_id: string
          stamp_position?: string
          stamp_position_overrides?: Json | null
          stamp_x_ratio?: number | null
          stamp_y_ratio?: number | null
          stamped_pdf_path?: string | null
          subject?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          original_pdf_path?: string
          request_id?: string
          selected_pages?: string
          stamp_id?: string
          stamp_position?: string
          stamp_position_overrides?: Json | null
          stamp_x_ratio?: number | null
          stamp_y_ratio?: number | null
          stamped_pdf_path?: string | null
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stamp_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stamp_requests_stamp_id_fkey"
            columns: ["stamp_id"]
            isOneToOne: false
            referencedRelation: "stamps"
            referencedColumns: ["id"]
          },
        ]
      }
      stamps: {
        Row: {
          created_at: string | null
          height: number
          id: string
          image_path: string
          is_active: boolean
          name: string
          updated_at: string | null
          width: number
        }
        Insert: {
          created_at?: string | null
          height?: number
          id?: string
          image_path: string
          is_active?: boolean
          name: string
          updated_at?: string | null
          width?: number
        }
        Update: {
          created_at?: string | null
          height?: number
          id?: string
          image_path?: string
          is_active?: boolean
          name?: string
          updated_at?: string | null
          width?: number
        }
        Relationships: []
      }
      travel_assignment_requests: {
        Row: {
          accommodation_cost: number | null
          accommodation_needed: boolean
          actual_departure_at: string | null
          actual_return_at: string | null
          advance_requested: boolean
          assignment_subject: string
          company_id: string
          created_at: string | null
          destination_city: string
          destination_institution: string
          estimated_departure_at: string
          estimated_return_at: string
          id: string
          request_id: string
          transportation_cost: number | null
          transportation_type: string
          updated_at: string | null
        }
        Insert: {
          accommodation_cost?: number | null
          accommodation_needed?: boolean
          actual_departure_at?: string | null
          actual_return_at?: string | null
          advance_requested?: boolean
          assignment_subject: string
          company_id: string
          created_at?: string | null
          destination_city: string
          destination_institution: string
          estimated_departure_at: string
          estimated_return_at: string
          id?: string
          request_id: string
          transportation_cost?: number | null
          transportation_type: string
          updated_at?: string | null
        }
        Update: {
          accommodation_cost?: number | null
          accommodation_needed?: boolean
          actual_departure_at?: string | null
          actual_return_at?: string | null
          advance_requested?: boolean
          assignment_subject?: string
          company_id?: string
          created_at?: string | null
          destination_city?: string
          destination_institution?: string
          estimated_departure_at?: string
          estimated_return_at?: string
          id?: string
          request_id?: string
          transportation_cost?: number | null
          transportation_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_assignment_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_assignment_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
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
      user_ms_tokens: {
        Row: {
          access_token: string
          access_token_expires_at: string
          created_at: string
          provider_user_id: string | null
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          access_token_expires_at: string
          created_at?: string
          provider_user_id?: string | null
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          access_token_expires_at?: string
          created_at?: string
          provider_user_id?: string | null
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workflow_definitions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_restricted: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_restricted?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_restricted?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      workflow_initiators: {
        Row: {
          created_at: string | null
          id: string
          position_id: string | null
          unit_id: string | null
          workflow_definition_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          position_id?: string | null
          unit_id?: string | null
          workflow_definition_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          position_id?: string | null
          unit_id?: string | null
          workflow_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_initiators_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_initiators_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "organizational_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_initiators_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_step_attachments: {
        Row: {
          allowed_mime_types: string[] | null
          created_at: string | null
          id: string
          is_required: boolean
          label: string
          max_file_size_bytes: number | null
          max_files: number | null
          workflow_step_id: string
        }
        Insert: {
          allowed_mime_types?: string[] | null
          created_at?: string | null
          id?: string
          is_required?: boolean
          label: string
          max_file_size_bytes?: number | null
          max_files?: number | null
          workflow_step_id: string
        }
        Update: {
          allowed_mime_types?: string[] | null
          created_at?: string | null
          id?: string
          is_required?: boolean
          label?: string
          max_file_size_bytes?: number | null
          max_files?: number | null
          workflow_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_step_attachments_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          action_type: string | null
          approver_type: Database["public"]["Enums"]["approver_type"]
          condition: Json | null
          created_at: string
          form_section_key: string | null
          id: string
          is_required: boolean
          name: string
          phase: string
          static_position_id: string | null
          step_order: number
          workflow_definition_id: string
        }
        Insert: {
          action_type?: string | null
          approver_type: Database["public"]["Enums"]["approver_type"]
          condition?: Json | null
          created_at?: string
          form_section_key?: string | null
          id?: string
          is_required?: boolean
          name: string
          phase?: string
          static_position_id?: string | null
          step_order: number
          workflow_definition_id: string
        }
        Update: {
          action_type?: string | null
          approver_type?: Database["public"]["Enums"]["approver_type"]
          condition?: Json | null
          created_at?: string
          form_section_key?: string | null
          id?: string
          is_required?: boolean
          name?: string
          phase?: string
          static_position_id?: string | null
          step_order?: number
          workflow_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_static_position_id_fkey"
            columns: ["static_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_mukayese_request: {
        Args: {
          p_header: Json
          p_items: Json
          p_prices: Json
          p_requester_employee_id: string
          p_suppliers: Json
          p_workflow_definition_id: string
        }
        Returns: string
      }
      create_notification: {
        Args: {
          p_message: string
          p_reference_id?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      get_current_employee_id: { Args: never; Returns: string }
      is_approver_for_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      is_approver_for_same_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
    }
    Enums: {
      accounting_capacity_type: "KAPASITE" | "ANASAHA" | "YEKA"
      approval_status: "PENDING" | "APPROVED" | "REJECTED"
      approver_type:
        | "REQUESTER"
        | "UNIT_HEAD"
        | "STATIC_POSITION"
        | "DYNAMIC_USER_LIST"
      checklist_status: "DONE" | "NOT_DONE" | "NA"
      finance_expense_area: "ANA_SAHA" | "ELEKTRIKSEL_KAPASITE_ARTISI" | "YEKA"
      finance_funding_source: "KREDI" | "OZ_KAYNAK" | "NAKIT_FAZLASI" | "DIGER"
      leave_type: "ANNUAL_LEAVE" | "SHORT_LEAVE"
      mukayese_currency: "TRY" | "USD" | "EUR"
      mukayese_row_type: "ITEM" | "SUBTOTAL"
      mukayese_unit: "ADET" | "SET" | "GUN"
      notification_type:
        | "APPROVAL_REQUIRED"
        | "REQUEST_APPROVED"
        | "REQUEST_REJECTED"
        | "REQUEST_CANCELLED"
      overtime_reason_category:
        | "SHIFT_OUTSIDE"
        | "NON_CONTINUOUS"
        | "EMERGENCY_CASE"
        | "SUDDEN_DEVELOPMENT"
        | "ON_REQUEST"
        | "STAFF_SHORTAGE"
        | "REPORTING"
        | "ENERGY_PRODUCTION"
      overtime_type: "EMERGENCY" | "STAFF_SHORTAGE"
      request_status:
        | "DRAFT"
        | "PENDING"
        | "APPROVED"
        | "REJECTED"
        | "CANCELLED"
        | "AWAITING_COMPLETION"
        | "COMPLETED"
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
    Enums: {
      accounting_capacity_type: ["KAPASITE", "ANASAHA", "YEKA"],
      approval_status: ["PENDING", "APPROVED", "REJECTED"],
      approver_type: [
        "REQUESTER",
        "UNIT_HEAD",
        "STATIC_POSITION",
        "DYNAMIC_USER_LIST",
      ],
      checklist_status: ["DONE", "NOT_DONE", "NA"],
      finance_expense_area: ["ANA_SAHA", "ELEKTRIKSEL_KAPASITE_ARTISI", "YEKA"],
      finance_funding_source: ["KREDI", "OZ_KAYNAK", "NAKIT_FAZLASI", "DIGER"],
      leave_type: ["ANNUAL_LEAVE", "SHORT_LEAVE"],
      mukayese_currency: ["TRY", "USD", "EUR"],
      mukayese_row_type: ["ITEM", "SUBTOTAL"],
      mukayese_unit: ["ADET", "SET", "GUN"],
      notification_type: [
        "APPROVAL_REQUIRED",
        "REQUEST_APPROVED",
        "REQUEST_REJECTED",
        "REQUEST_CANCELLED",
      ],
      overtime_reason_category: [
        "SHIFT_OUTSIDE",
        "NON_CONTINUOUS",
        "EMERGENCY_CASE",
        "SUDDEN_DEVELOPMENT",
        "ON_REQUEST",
        "STAFF_SHORTAGE",
        "REPORTING",
        "ENERGY_PRODUCTION",
      ],
      overtime_type: ["EMERGENCY", "STAFF_SHORTAGE"],
      request_status: [
        "DRAFT",
        "PENDING",
        "APPROVED",
        "REJECTED",
        "CANCELLED",
        "AWAITING_COMPLETION",
        "COMPLETED",
      ],
    },
  },
} as const
