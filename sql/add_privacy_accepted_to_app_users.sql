-- app_users tablosuna gizlilik sözleşmesi onay tarihi kolonu ekleme
-- NULL = henüz onaylamamış, dolu = onaylamış

ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz;

-- Kullanıcının kendi privacy_accepted_at alanını güncelleyebilmesi için RLS politikası
CREATE POLICY app_users_update_privacy_self
  ON public.app_users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
