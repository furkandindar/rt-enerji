-- ============================================================================
-- stamp_requests: Özel kaşe konumlandırma alanları
-- ============================================================================
--
-- Amaç:
--   Kaşeli Belge Onayı sürecinde, kullanıcının önceden tanımlı (bottom-right vb.)
--   pozisyonlar yerine PDF sayfası üzerinde serbestçe konum belirlemesi için
--   yeni kolonlar ekler. Geriye dönük uyumluluk için eski "stamp_position"
--   (text) kolonu korunur; yeni kolonlar NULL ise eski preset davranışı devam eder.
--
-- Konvansiyon:
--   - stamp_x_ratio / stamp_y_ratio = kaşenin SOL-ÜST köşesinin sayfa
--     genişliğine/yüksekliğine oranı (0-1). UI top-left origin.
--   - stamp_position_overrides = sayfa bazlı override map. Anahtar 1-tabanlı
--     sayfa numarası (string), değer {"x": number, "y": number}.
--     NULL veya boş ise tüm sayfalar default ratio'yu kullanır.
-- ============================================================================

BEGIN;

ALTER TABLE public.stamp_requests
  ADD COLUMN IF NOT EXISTS stamp_x_ratio NUMERIC(7,6),
  ADD COLUMN IF NOT EXISTS stamp_y_ratio NUMERIC(7,6),
  ADD COLUMN IF NOT EXISTS stamp_position_overrides JSONB;

-- Ratio sınırları: her biri 0-1 arasında veya NULL
ALTER TABLE public.stamp_requests
  DROP CONSTRAINT IF EXISTS stamp_requests_ratio_bounds;

ALTER TABLE public.stamp_requests
  ADD CONSTRAINT stamp_requests_ratio_bounds CHECK (
    (stamp_x_ratio IS NULL OR (stamp_x_ratio >= 0 AND stamp_x_ratio <= 1))
    AND
    (stamp_y_ratio IS NULL OR (stamp_y_ratio >= 0 AND stamp_y_ratio <= 1))
  );

-- x ve y: ikisi birden dolu veya ikisi birden boş olmalı (atomic)
ALTER TABLE public.stamp_requests
  DROP CONSTRAINT IF EXISTS stamp_requests_xy_both_or_none;

ALTER TABLE public.stamp_requests
  ADD CONSTRAINT stamp_requests_xy_both_or_none CHECK (
    (stamp_x_ratio IS NULL AND stamp_y_ratio IS NULL)
    OR
    (stamp_x_ratio IS NOT NULL AND stamp_y_ratio IS NOT NULL)
  );

-- Overrides: JSON objesi olmalı (null da kabul)
ALTER TABLE public.stamp_requests
  DROP CONSTRAINT IF EXISTS stamp_requests_overrides_is_object;

ALTER TABLE public.stamp_requests
  ADD CONSTRAINT stamp_requests_overrides_is_object CHECK (
    stamp_position_overrides IS NULL
    OR jsonb_typeof(stamp_position_overrides) = 'object'
  );

-- Dokümantasyon
COMMENT ON COLUMN public.stamp_requests.stamp_x_ratio IS
  'Kaşenin sol-üst köşesi için X oranı (0-1), UI top-left origin. NULL ise stamp_position preset kullanılır.';
COMMENT ON COLUMN public.stamp_requests.stamp_y_ratio IS
  'Kaşenin sol-üst köşesi için Y oranı (0-1), UI top-left origin. NULL ise stamp_position preset kullanılır.';
COMMENT ON COLUMN public.stamp_requests.stamp_position_overrides IS
  'Sayfa bazlı konum override. Format: {"<1-based_page_number>": {"x": 0-1, "y": 0-1}}. NULL veya {} ise tüm sayfalarda default ratio kullanılır.';

COMMIT;

-- ============================================================================
-- ROLLBACK (gerekirse)
-- ============================================================================
-- BEGIN;
-- ALTER TABLE public.stamp_requests
--   DROP CONSTRAINT IF EXISTS stamp_requests_ratio_bounds,
--   DROP CONSTRAINT IF EXISTS stamp_requests_xy_both_or_none,
--   DROP CONSTRAINT IF EXISTS stamp_requests_overrides_is_object,
--   DROP COLUMN IF EXISTS stamp_x_ratio,
--   DROP COLUMN IF EXISTS stamp_y_ratio,
--   DROP COLUMN IF EXISTS stamp_position_overrides;
-- COMMIT;
