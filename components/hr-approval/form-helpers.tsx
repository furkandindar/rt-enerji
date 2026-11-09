"use client";

// İK Onay formlarının (İşe Giriş / İşten Çıkış Onay) ortak form parçaları ve gönderim akışı.

import { z } from "zod";
import { FormControl } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadPendingFiles } from "@/lib/attachments/upload-attachment";
import { showFailedUploadsToast } from "@/components/pending-attachments-field";
import { pickOne } from "@/lib/hr-approval/display";
import type { HrFormCompanyOption } from "./use-hr-approval-form-setup";

// Sunucu doğrulamasıyla (lib/hr-approval/forms.ts) aynı sınırlar
export const SHORT_TEXT_MAX = 200;
export const LONG_TEXT_MAX = 2000;
export const PERIOD_TEXT_MAX = 40;
const AMOUNT_ABS_MAX = 999_999_999_999.99;

export const requiredText = (label: string, max = SHORT_TEXT_MAX) =>
  z.string().trim().min(1, `${label} zorunludur`).max(max, `${label} en fazla ${max} karakter olabilir`);

export const optionalText = (label: string, max = SHORT_TEXT_MAX) =>
  z.string().trim().max(max, `${label} en fazla ${max} karakter olabilir`);

export const dateString = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} zorunludur`);

const isValidAmount = (v: string, allowNegative: boolean) => {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= AMOUNT_ABS_MAX && (allowNegative || n >= 0);
};

/** Boş bırakılabilir tutar (string tutulur; "" = boş). */
export const optionalAmount = (opts: { allowNegative?: boolean } = {}) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || isValidAmount(v, !!opts.allowNegative), {
      message: opts.allowNegative ? "Geçerli bir tutar girin" : "Geçerli, eksi olmayan bir tutar girin",
    });

export const requiredAmount = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} zorunludur`)
    .refine((v) => isValidAmount(v, false), { message: "Geçerli, eksi olmayan bir tutar girin" });

/** "" → null, "1234.5" → 1234.5 */
export const toAmountOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));
/** "" → null */
export const toTextOrNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());
/** DB tutarı → input değeri */
export const amountToInput = (v: number | string | null | undefined): string =>
  v === null || v === undefined ? "" : String(v);

/** Şirket sözlüğünden seçim. Kayıtlı değer listede yoksa (pasif şirket) yine gösterilir. */
export function CompanySelect({
  value,
  onChange,
  companies,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  companies: HrFormCompanyOption[];
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <FormControl>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Şirket seçiniz" />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {companies.map((c) => (
          <SelectItem key={c.id} value={c.name}>
            {c.name}
          </SelectItem>
        ))}
        {value && !companies.some((c) => c.name === value) && <SelectItem value={value}>{value}</SelectItem>}
      </SelectContent>
    </Select>
  );
}

/** Düzenleme modu: talebin detay kaydını getirir (RLS'li detay ucu). */
export async function loadHrApprovalEditRecord<T>(editId: string, relation: string): Promise<T | null> {
  const res = await fetch(`/api/my-requests/${editId}`);
  if (!res.ok) return null;
  const body = (await res.json()) as Record<string, unknown>;
  return pickOne(body[relation] as T | T[] | null | undefined);
}

/**
 * Oluştur (POST) veya güncelle (PATCH + resubmit). Oluşturmada seçilen ekler talep
 * açıldıktan sonra yüklenir; düzenlemede ekler RequestEditAttachments ile anında işlenir.
 */
export async function submitHrApprovalForm(opts: {
  apiPath: string;
  editId: string | null;
  payload: unknown;
  revisionPayload: Record<string, unknown>;
  pendingFiles: File[];
  attachmentConfigId: string | null;
}): Promise<"created" | "updated"> {
  const { apiPath, editId, payload, revisionPayload, pendingFiles, attachmentConfigId } = opts;
  const response = await fetch(editId ? `${apiPath}/${editId}` : apiPath, {
    method: editId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || (editId ? "Talep güncellenemedi" : "Talep oluşturulamadı"));
  }

  if (editId) {
    const resubmitRes = await fetch(`/api/requests/${editId}/resubmit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(revisionPayload),
    });
    if (!resubmitRes.ok) {
      const err = await resubmitRes.json().catch(() => ({}));
      throw new Error(err.error || "Talep güncellendi ama yeniden gönderilemedi");
    }
    return "updated";
  }

  const created = (await response.json()) as { id?: string };
  if (created.id && pendingFiles.length > 0) {
    const failed = await uploadPendingFiles(pendingFiles, created.id, attachmentConfigId);
    showFailedUploadsToast(failed);
  }
  return "created";
}
