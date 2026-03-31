-- ============================================================================
-- REQUEST FORM (Talep Formu) - Veritabanı Şeması
-- ============================================================================

-- NOT: workflow_definitions ve workflow_steps kayıtları Supabase'de elle oluşturulacak.
-- Workflow Code: REQUEST_FORM
-- Adımlar: 1) REQUESTER (FILL_AND_SIGN), 2) UNIT_HEAD (SIGN_ONLY), 3) STATIC_POSITION - Genel Müdür (SIGN_ONLY)

-- ============================================================================
-- 1. Süreç-Spesifik Tablo
-- ============================================================================

CREATE TABLE public.request_form_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,

  -- Form alanları
  requester_name TEXT NOT NULL,                -- Talep edenin adı soyadı
  company TEXT NOT NULL,                        -- Şirket adı (serbest metin)
  request_date DATE NOT NULL DEFAULT CURRENT_DATE, -- Talep tarihi
  subject TEXT NOT NULL,                        -- Konu
  content TEXT NOT NULL,                        -- Talep içerik
  quantity TEXT,                                  -- Talep miktarı (opsiyonel, serbest metin)
  amount DECIMAL(12,2),                         -- Talep tutarı (opsiyonel, TL)
  reason TEXT,                                  -- Talep nedeni
  request_type TEXT NOT NULL CHECK (request_type IN ('MUTFAK', 'KIRTASIYE', 'DIGER')), -- Talep türü

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(request_id)
);

-- Index
CREATE INDEX idx_request_form_requests_request_id ON public.request_form_requests(request_id);

-- ============================================================================
-- 2. RLS Politikaları
-- ============================================================================

ALTER TABLE public.request_form_requests ENABLE ROW LEVEL SECURITY;

-- Select: Talep sahibi veya onaycılar görebilir
CREATE POLICY "request_form_requests_select" ON public.request_form_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_id
      AND (
        r.requester_employee_id IN (SELECT employee_id FROM app_users WHERE id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.request_approvals ra
          WHERE ra.request_id = r.id
          AND ra.approver_employee_id IN (SELECT employee_id FROM app_users WHERE id = auth.uid())
        )
      )
    )
  );

-- Insert: Sadece kendi talebi için
CREATE POLICY "request_form_requests_insert" ON public.request_form_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id AND au.id = auth.uid()
    )
  );

-- Update: Sadece kendi talebi için (DRAFT durumundayken)
CREATE POLICY "request_form_requests_update" ON public.request_form_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id AND au.id = auth.uid()
      AND r.status = 'DRAFT'
    )
  );

-- ============================================================================
-- 3. Ek Dosya Konfigürasyonu (Talep Eden adımında dosya ekleyebilsin)
-- ============================================================================
-- NOT: Bu kısım workflow_steps oluşturulduktan sonra çalıştırılmalı

-- INSERT INTO public.workflow_step_attachments (workflow_step_id, label, is_required, allowed_mime_types, max_file_size_bytes, max_files)
-- SELECT ws.id, 'Ek Dosya', false, '{application/pdf,image/jpeg,image/png}', 10485760, 5
-- FROM public.workflow_steps ws
-- JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
-- WHERE wd.code = 'REQUEST_FORM' AND ws.step_order = 1;

