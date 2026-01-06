-- Add pdf_path column to requests table
-- This will store the Supabase Storage path for the generated PDF

ALTER TABLE public.requests 
ADD COLUMN IF NOT EXISTS pdf_path TEXT;

COMMENT ON COLUMN public.requests.pdf_path IS 'Supabase Storage path for the approved request PDF document';

