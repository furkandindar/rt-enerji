# Dev → Prod Schema Karşılaştırma Raporu

- **Dev dosyası:** `dev_schema.sql`
- **Prod dosyası:** `prod_schema.sql`

> Bu rapor `pg_dump --schema-only` çıktıları karşılaştırılarak otomatik üretilmiştir.
> İki ortam arasındaki **şema farklılıklarını** gösterir, **veri farkı** içermez.

## 📊 Özet

| Kategori | Sadece DEV'de | Sadece PROD'da | İki tarafta farklı |
|---|---|---|---|
| Tablolar | 0 | 0 | 2 |
| Enum types | 0 | 0 | 0 |
| Functions | 0 | 0 | 0 |
| Policies | 0 | 0 | 0 |
| Triggers | 0 | 0 | 0 |
| Indexes | 0 | 0 | 0 |

## 🆕 Yeni Tablolar (DEV'de var, PROD'da yok)

_(yok)_

## 🗑️ PROD'da olup DEV'de olmayan tablolar

_(yok — hiçbir prod tablosu silinmemiş, ✅ güvenli)_

## ✏️ Mevcut Tablolarda Kolon Değişiklikleri

_(mevcut tablolarda kolon değişikliği yok)_

## 🧩 Enum Type Değişiklikleri

_(enum değişikliği yok)_

## ⚙️ Function Değişiklikleri

_(function değişikliği yok)_

## 🔐 RLS Policy Değişiklikleri

_(policy değişikliği yok)_

## 🔔 Trigger Değişiklikleri

_(trigger değişikliği yok)_

## 🔑 Index Değişiklikleri

_(index değişikliği yok)_
