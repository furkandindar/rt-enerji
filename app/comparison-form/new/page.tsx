"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Scale, AlertCircle, TrendingUp, Upload, X, FileText } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { SignaturePanel } from "@/components/signature-panel";
import { SignatureFont } from "@/lib/signature/types";
import type { FxRatesResponse } from "@/app/api/fx-rates/route";
import {
  MatrixEditor,
  cellKey,
  type MatrixItem,
  type MatrixSupplier,
  type MatrixPrices,
} from "@/components/comparison-form/matrix-editor";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CURRENCY_OPTIONS = [
  { value: "TRY", label: "TRY (₺)" },
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
] as const;

const headerSchema = z.object({
  project_title: z.string().min(1, "Proje başlığı gerekli"),
  form_currency: z.enum(["TRY", "USD", "EUR"], { message: "Para birimi seçin" }),
  form_date: z.string().min(1, "Tarih gerekli"),
  preparer_full_name: z.string().min(1, "Hazırlayan ad-soyad gerekli"),
  company: z.string().min(1, "Firma gerekli"),
  subject: z.string().min(1, "Konu gerekli"),
  request_content: z.string().min(1, "Talep içeriği gerekli"),
  request_amount_text: z.string().min(1, "Talep tutarı gerekli"),
  request_reason: z.string().min(1, "Talep gerekçesi gerekli"),
  kdv_rate: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((v) => !isNaN(v) && v >= 0 && v <= 100, "KDV oranı 0–100 arasında olmalı"),
  notes: z.string().optional(),
});

type HeaderFormInput = z.input<typeof headerSchema>;
type HeaderFormValues = z.output<typeof headerSchema>;

interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

interface Company {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

const tryFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const parityFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

// ============================================================================
// Test seed — placeholder verilerle hızlı form oluşturma (geliştirme/test için)
// ============================================================================

const localId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `c_${Math.random().toString(36).slice(2)}_${Date.now()}`;

const SEED_SUPPLIERS_DATA = [
  { name: "Alfa Elektrik San. A.Ş.", payment: "30 gün vadeli", delivery: "15 iş günü", tech: "TS EN 60076-1 uyumlu", contact: "Mehmet Yılmaz", phone: "0532 111 22 33" },
  { name: "Beta Trafo Ltd. Şti.", payment: "Peşin %5 iskonto", delivery: "20 iş günü", tech: "IEC 60076-2 uyumlu", contact: "Ayşe Demir", phone: "0533 222 33 44" },
  { name: "Gamma Endüstri A.Ş.", payment: "60 gün vadeli", delivery: "10 iş günü", tech: "TS EN 60076-3 uyumlu", contact: "Ali Kaya", phone: "0534 333 44 55" },
  { name: "Delta Enerji San. ve Tic.", payment: "30 gün vadeli", delivery: "25 iş günü", tech: "IEC 60076-7 uyumlu", contact: "Fatma Şahin", phone: "0535 444 55 66" },
  { name: "Epsilon Elektromekanik", payment: "45 gün vadeli", delivery: "18 iş günü", tech: "TS EN 60076-11 uyumlu", contact: "Hasan Çelik", phone: "0536 555 66 77" },
  { name: "Zeta Power Sistemleri", payment: "Peşin", delivery: "12 iş günü", tech: "IEC 60076-16 uyumlu", contact: "Zeynep Arslan", phone: "0537 666 77 88" },
];

type SeedItem = {
  type: "ITEM" | "SUBTOTAL";
  desc: string;
  qty?: number;
  unit?: "ADET" | "SET" | "GUN";
  basePrice?: number;
};

const SEED_ITEMS_DATA: SeedItem[] = [
  { type: "ITEM", desc: "Trafo 1600 kVA 33/0.4 kV ONAN", qty: 4, unit: "ADET", basePrice: 850000 },
  { type: "ITEM", desc: "Trafo aksesuar seti (silikajel, termometre, buchholz)", qty: 4, unit: "SET", basePrice: 12500 },
  { type: "ITEM", desc: "Topraklama bara seti 60x10 mm", qty: 8, unit: "ADET", basePrice: 8200 },
  { type: "ITEM", desc: "Trafo bağlantı kablosu 4x240 mm² XLPE", qty: 240, unit: "ADET", basePrice: 1850 },
  { type: "ITEM", desc: "Yağ tahliye sistemi", qty: 4, unit: "SET", basePrice: 18500 },
  { type: "SUBTOTAL", desc: "Trafo grubu ara toplam" },
  { type: "ITEM", desc: "OG hücresi 36 kV vakumlu kesicili", qty: 6, unit: "ADET", basePrice: 165000 },
  { type: "ITEM", desc: "OG akım trafosu 50/5 A 5P20", qty: 18, unit: "ADET", basePrice: 4200 },
  { type: "ITEM", desc: "OG gerilim trafosu 36/0.1 kV", qty: 6, unit: "ADET", basePrice: 5800 },
  { type: "ITEM", desc: "Koruma rölesi (mesafe + diferansiyel)", qty: 6, unit: "ADET", basePrice: 22000 },
  { type: "ITEM", desc: "OG bara sistemi 1250 A", qty: 1, unit: "SET", basePrice: 95000 },
  { type: "SUBTOTAL", desc: "OG hücre grubu ara toplam" },
  { type: "ITEM", desc: "Devreye alma ve test mühendisliği", qty: 15, unit: "GUN", basePrice: 8500 },
  { type: "ITEM", desc: "Yerinde montaj işçiliği", qty: 30, unit: "GUN", basePrice: 5200 },
  { type: "ITEM", desc: "Nakliye ve sigorta", qty: 1, unit: "SET", basePrice: 45000 },
  { type: "ITEM", desc: "Eğitim ve dokümantasyon", qty: 1, unit: "SET", basePrice: 12000 },
  { type: "ITEM", desc: "1 yıl garanti dışı bakım rezervi", qty: 4, unit: "GUN", basePrice: 7500 },
  { type: "SUBTOTAL", desc: "Hizmet grubu ara toplam" },
];

const SUPPLIER_MULT = [0.92, 0.97, 1.0, 1.05, 1.1, 1.15];

function seedMatrix(): { items: MatrixItem[]; suppliers: MatrixSupplier[]; prices: MatrixPrices } {
  const suppliers: MatrixSupplier[] = SEED_SUPPLIERS_DATA.map((s) => ({
    id: localId(),
    company_name: s.name,
    payment_terms: s.payment,
    delivery_time: s.delivery,
    technical_description: s.tech,
    contact_name: s.contact,
    contact_phone: s.phone,
  }));
  const items: MatrixItem[] = SEED_ITEMS_DATA.map((it) => ({
    id: localId(),
    row_type: it.type,
    description: it.desc,
    quantity: it.type === "ITEM" ? (it.qty ?? 1) : null,
    unit: it.type === "ITEM" ? (it.unit ?? "ADET") : null,
  }));
  const prices: MatrixPrices = {};
  SEED_ITEMS_DATA.forEach((seed, idx) => {
    if (seed.type !== "ITEM" || !seed.basePrice) return;
    suppliers.forEach((sup, sIdx) => {
      const variation = Math.sin(idx * 1.7 + sIdx * 0.9) * 0.04; // ±4% varyans
      const price = Math.round(seed.basePrice! * SUPPLIER_MULT[sIdx] * (1 + variation));
      prices[cellKey(items[idx].id, sup.id)] = price;
    });
  });
  return { items, suppliers, prices };
}

export default function NewComparisonFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  const supabase = createClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingEditData, setLoadingEditData] = useState<boolean>(isEditMode);
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [signatureInfo, setSignatureInfo] = useState<SignatureInfo>({
    signatureText: null,
    signatureFont: null,
  });
  const [loadingUser, setLoadingUser] = useState(true);

  // FX snapshot — talep oluşturulurken anlık alınır, gönderim body'sine eklenir
  const [fxData, setFxData] = useState<FxRatesResponse | null>(null);
  const [fxLoading, setFxLoading] = useState(true);
  const [fxError, setFxError] = useState<string | null>(null);

  // Şirket listesi (companies dictionary)
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);

  // Ek dosyalar (workflow_step_attachments config'inden gelir)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentConfigId, setAttachmentConfigId] = useState<string | null>(null);
  const [attachmentLabel, setAttachmentLabel] = useState<string>("Ek Dosya");
  const [allowedMimeTypes, setAllowedMimeTypes] = useState<string[] | null>(null);
  const [maxFileSizeBytes, setMaxFileSizeBytes] = useState<number>(10485760);
  const [maxFiles, setMaxFiles] = useState<number>(5);

  // Matris state — items / suppliers / prices (test seed ile başlatılır)
  const [matrixSeed] = useState(() => seedMatrix());
  const [matrixItems, setMatrixItems] = useState<MatrixItem[]>(matrixSeed.items);
  const [matrixSuppliers, setMatrixSuppliers] = useState<MatrixSupplier[]>(matrixSeed.suppliers);
  const [matrixPrices, setMatrixPrices] = useState<MatrixPrices>(matrixSeed.prices);

  const form = useForm<HeaderFormInput, unknown, HeaderFormValues>({
    resolver: zodResolver(headerSchema),
    defaultValues: {
      project_title: "RES Trafo & OG Hücre Tedariği — Test",
      form_currency: "TRY",
      form_date: new Date().toISOString().split("T")[0],
      preparer_full_name: "",
      company: "",
      subject: "Trafo merkezi ekipman alımı",
      request_content:
        "RES sahası için 4 adet 1600 kVA trafo, 6 adet OG hücresi ve aksesuarlar dahil komple paket tedariği talep edilmektedir.",
      request_amount_text: "Toplam tahmini bedel ≈ 6.500.000 ₺ (KDV hariç)",
      request_reason:
        "Devreye alma planına göre Q2 sonuna kadar saha teslimi gereklidir; mevcut ekipman ömrü dolmuş, yenileme zorunlu.",
      kdv_rate: 20,
      notes:
        "Tüm ekipmanlar TSE ve IEC standartlarına uygun olmalıdır. Devreye alma test raporları talep edilecektir.",
    },
  });

  // V5: Edit mode — ?edit=<id> ile gelirse mevcut talebi yükle
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/my-requests`);
        if (!res.ok) {
          toast.error("Talep bulunamadı");
          return;
        }
        const body = await res.json();
        const found = (body.requests as Array<{ id: string; mukayese_request?: Record<string, unknown> }>)?.find(
          (r) => r.id === editId
        );
        if (!found || !found.mukayese_request) {
          toast.error("Talep bulunamadı");
          return;
        }
        const f = found.mukayese_request as {
          project_title?: string;
          form_currency?: "TRY" | "USD" | "EUR";
          form_date?: string;
          preparer_full_name?: string;
          company?: string;
          subject?: string;
          request_content?: string;
          request_amount_text?: string;
          request_reason?: string;
          notes?: string | null;
          kdv_rate?: number;
          fx_eur_try?: number | null;
          fx_usd_try?: number | null;
          fx_eur_usd?: number | null;
          fx_snapshot_at?: string | null;
          items?: Array<{
            id: string;
            row_order: number;
            row_type: "ITEM" | "SUBTOTAL";
            description: string | null;
            quantity: number | null;
            unit: "ADET" | "SET" | "GUN" | null;
          }>;
          suppliers?: Array<{
            id: string;
            column_order: number;
            company_name: string;
            payment_terms: string | null;
            delivery_time: string | null;
            technical_description: string | null;
            contact_name: string | null;
            contact_phone: string | null;
          }>;
          prices?: Array<{
            mukayese_item_id: string;
            mukayese_supplier_id: string;
            unit_price: number;
          }>;
        };
        if (cancelled) return;

        // Header form'unu reset et
        form.reset({
          project_title: f.project_title ?? "",
          form_currency: f.form_currency ?? "TRY",
          form_date: f.form_date ?? new Date().toISOString().split("T")[0],
          preparer_full_name: f.preparer_full_name ?? "",
          company: f.company ?? "",
          subject: f.subject ?? "",
          request_content: f.request_content ?? "",
          request_amount_text: f.request_amount_text ?? "",
          request_reason: f.request_reason ?? "",
          kdv_rate: f.kdv_rate ?? 20,
          notes: f.notes ?? "",
        });

        // Matrix state'i reset et — DB id'lerini client id olarak kullanırız;
        // submit'te tüm matris zaten yeniden numaralandırılarak gönderiliyor.
        const sortedItems = (f.items ?? [])
          .slice()
          .sort((a, b) => (a.row_order ?? 0) - (b.row_order ?? 0))
          .map((it) => ({
            id: it.id, // DB UUID — client matrix tarafından opak şekilde kullanılır
            row_type: it.row_type,
            description: it.description ?? "",
            quantity: it.row_type === "ITEM" ? (it.quantity ?? null) : null,
            unit: it.row_type === "ITEM" ? (it.unit ?? null) : null,
          })) as MatrixItem[];

        const sortedSuppliers = (f.suppliers ?? [])
          .slice()
          .sort((a, b) => (a.column_order ?? 0) - (b.column_order ?? 0))
          .map((s) => ({
            id: s.id, // DB UUID — client matrix tarafından opak şekilde kullanılır
            company_name: s.company_name ?? "",
            payment_terms: s.payment_terms ?? "",
            delivery_time: s.delivery_time ?? "",
            technical_description: s.technical_description ?? "",
            contact_name: s.contact_name ?? "",
            contact_phone: s.contact_phone ?? "",
          })) as MatrixSupplier[];

        const pricesMap: MatrixPrices = {};
        for (const p of f.prices ?? []) {
          pricesMap[cellKey(p.mukayese_item_id, p.mukayese_supplier_id)] = p.unit_price;
        }

        setMatrixItems(sortedItems);
        setMatrixSuppliers(sortedSuppliers);
        setMatrixPrices(pricesMap);
      } catch (err) {
        console.error("Edit data load error:", err);
        toast.error("Talep yüklenirken hata oluştu");
      } finally {
        if (!cancelled) setLoadingEditData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Kullanıcı + imza yükle, hazırlayan alanlarını doldur
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: appUser } = await supabase
          .from("app_users")
          .select("employee_id")
          .eq("id", user.id)
          .single();

        if (!appUser?.employee_id) return;

        const { data: employee } = await supabase
          .from("employees")
          .select("first_name, last_name, signature_text, signature_font")
          .eq("id", appUser.employee_id)
          .single();

        if (employee) {
          setSignatureInfo({
            signatureText: employee.signature_text,
            signatureFont: employee.signature_font as SignatureFont | null,
          });
          const fullName = `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim();
          form.setValue("preparer_full_name", fullName);
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setLoadingUser(false);
      }
    };

    loadUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FX kurlarını çek (snapshot için)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/fx-rates");
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setFxError(body?.error ?? "Kurlar alınamadı");
        } else {
          setFxData(body as FxRatesResponse);
        }
      } catch {
        if (!cancelled) setFxError("Kurlar alınamadı");
      } finally {
        if (!cancelled) setFxLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Şirket listesini çek (sadece aktif olanlar)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/companies");
        if (!res.ok) return;
        const body = (await res.json()) as Company[];
        if (cancelled) return;
        const active = body.filter((c) => c.is_active);
        setCompanies(active);
        // Test/dev: ilk firmayı otomatik seç
        if (active.length > 0 && !form.getValues("company")) {
          form.setValue("company", active[0].name);
        }
      } catch (error) {
        console.error("Error loading companies:", error);
      } finally {
        if (!cancelled) setCompaniesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attachment config yükle (workflow_step_attachments — COMPARISON_FORM step 1)
  useEffect(() => {
    const loadAttachmentConfig = async () => {
      try {
        const { data: wfDef } = await supabase
          .from("workflow_definitions")
          .select("id")
          .eq("code", "COMPARISON_FORM")
          .single();
        if (!wfDef) return;

        const { data: step } = await supabase
          .from("workflow_steps")
          .select("id")
          .eq("workflow_definition_id", wfDef.id)
          .eq("step_order", 1)
          .single();
        if (!step) return;

        const { data: configs } = await supabase
          .from("workflow_step_attachments")
          .select("id, label, allowed_mime_types, max_file_size_bytes, max_files")
          .eq("workflow_step_id", step.id);

        if (configs && configs.length > 0) {
          const config = configs[0];
          setAttachmentConfigId(config.id);
          setAttachmentLabel(config.label);
          setAllowedMimeTypes(config.allowed_mime_types);
          setMaxFileSizeBytes(config.max_file_size_bytes);
          setMaxFiles(config.max_files);
        }
      } catch (error) {
        console.error("Error loading attachment config:", error);
      }
    };
    loadAttachmentConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      if (allowedMimeTypes && !allowedMimeTypes.includes(file.type)) {
        toast.error(`${file.name}: Desteklenmeyen dosya türü`);
        return false;
      }
      if (file.size > maxFileSizeBytes) {
        toast.error(`${file.name}: Dosya boyutu çok büyük (maks ${Math.round(maxFileSizeBytes / 1048576)} MB)`);
        return false;
      }
      return true;
    });
    setPendingFiles((prev) => {
      const combined = [...prev, ...validFiles];
      return combined.slice(0, maxFiles);
    });
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: HeaderFormValues) => {
    // Matris ön-validasyonu (backend de doğrular ama UX için erken hata)
    const itemRows = matrixItems.filter((it) => it.row_type === "ITEM");
    if (itemRows.length === 0) {
      toast.error("En az bir kalem satırı eklemelisiniz");
      return;
    }
    if (matrixSuppliers.length === 0) {
      toast.error("En az bir firma eklemelisiniz");
      return;
    }

    setIsSubmitting(true);
    try {
      // Client id'lerini row_order / column_order'a map'le
      const itemOrderById = new Map<string, number>();
      const apiItems = matrixItems.map((it, idx) => {
        const row_order = idx + 1;
        itemOrderById.set(it.id, row_order);
        return {
          row_order,
          row_type: it.row_type,
          description: it.description.trim(),
          quantity: it.row_type === "ITEM" ? it.quantity : null,
          unit: it.row_type === "ITEM" ? it.unit : null,
        };
      });

      const supplierOrderById = new Map<string, number>();
      const apiSuppliers = matrixSuppliers.map((s, idx) => {
        const column_order = idx + 1;
        supplierOrderById.set(s.id, column_order);
        return {
          column_order,
          company_name: s.company_name.trim(),
          payment_terms: s.payment_terms.trim() || null,
          delivery_time: s.delivery_time.trim() || null,
          technical_description: s.technical_description.trim() || null,
          contact_name: s.contact_name.trim() || null,
          contact_phone: s.contact_phone.trim() || null,
        };
      });

      const apiPrices: { row_order: number; column_order: number; unit_price: number }[] = [];
      for (const it of matrixItems) {
        if (it.row_type !== "ITEM") continue; // SUBTOTAL hücreleri backend'de hesaplanır/PDF'te
        const row_order = itemOrderById.get(it.id);
        if (!row_order) continue;
        for (const s of matrixSuppliers) {
          const column_order = supplierOrderById.get(s.id);
          if (!column_order) continue;
          const v = matrixPrices[cellKey(it.id, s.id)];
          if (typeof v === "number" && v >= 0) {
            apiPrices.push({ row_order, column_order, unit_price: v });
          }
        }
      }

      const body = {
        ...values,
        kdv_rate: Number(values.kdv_rate),
        notes: values.notes?.trim() || null,
        // FX snapshot
        fx_eur_try: fxData?.eurTry ?? null,
        fx_usd_try: fxData?.usdTry ?? null,
        fx_eur_usd: fxData?.eurUsd ?? null,
        fx_snapshot_at: fxData ? new Date().toISOString() : null,
        // Matris
        items: apiItems,
        suppliers: apiSuppliers,
        prices: apiPrices,
      };

      const url = isEditMode ? `/api/comparison-form/${editId}` : "/api/comparison-form";
      const method = isEditMode ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? (isEditMode ? "Talep güncellenemedi" : "Talep oluşturulamadı"));
        return;
      }

      if (isEditMode) {
        // V5: Edit sonrası otomatik resubmit → talep onay akışına geri girer
        const resubmitRes = await fetch(`/api/requests/${editId}/resubmit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!resubmitRes.ok) {
          const err = await resubmitRes.json().catch(() => ({}));
          toast.error(err.error || "Talep güncellendi ama yeniden gönderilemedi");
          return;
        }
        toast.success("Talep güncellendi ve onaya gönderildi");
      } else {
        // Dosyaları yükle (talep oluşturulduktan sonra) — sadece create
        const newRequestId: string | undefined = data?.id;
        if (newRequestId && pendingFiles.length > 0) {
          for (const file of pendingFiles) {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("request_id", newRequestId);
            if (attachmentConfigId) {
              formData.append("step_attachment_config_id", attachmentConfigId);
            }
            const uploadRes = await fetch("/api/attachments/upload", {
              method: "POST",
              body: formData,
            });
            if (!uploadRes.ok) {
              console.error("Dosya yüklenemedi:", file.name);
              toast.warning(`${file.name} yüklenemedi, talep yine de oluşturuldu`);
            }
          }
        }
        toast.success("Mukayese formu talebi oluşturuldu");
      }

      router.push("/my-requests");
    } catch (error) {
      console.error("Submit error:", error);
      toast.error("Beklenmeyen bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasValidSignature = Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);
  const hasItemRow = matrixItems.some((it) => it.row_type === "ITEM");
  const matrixReady = hasItemRow && matrixSuppliers.length > 0;
  const canSubmit = isEditMode
    ? !isSubmitting && !loadingUser && matrixReady
    : !isSubmitting && !loadingUser && hasValidSignature && signatureAccepted && matrixReady;

  if (loadingEditData) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Scale className="h-6 w-6" />
          {isEditMode ? "Talebi Güncelle" : "Yeni Mukayese Formu"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEditMode
            ? "Talep bilgilerini güncelleyin"
            : "Aynı iş için birden fazla firmadan alınan teklifleri matris üzerinden karşılaştırın"}
        </p>
      </div>

      <Card className="max-w-6xl">
        <CardHeader>
          <CardTitle>Form Bilgileri</CardTitle>
          <CardDescription>Başlık, talep metni ve hazırlayan bilgilerini girin</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Başlık alanları */}
              <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Başlık
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="project_title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Proje Başlığı</FormLabel>
                        <FormControl>
                          <Input placeholder="Örn. RES Trafo Tedariki" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Şirket</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={companiesLoading || companies.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  companiesLoading
                                    ? "Yükleniyor..."
                                    : companies.length === 0
                                      ? "Tanımlı şirket yok"
                                      : "Şirket seçin"
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {companies.map((c) => (
                              <SelectItem key={c.id} value={c.name}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Konu</FormLabel>
                        <FormControl>
                          <Input placeholder="Talep konusu" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="form_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Form Tarihi</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              {/* Para Birimi + KDV + FX Snapshot */}
              <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Para Birimi & Kurlar
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="form_currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Form Para Birimi</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seçin" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CURRENCY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="kdv_rate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>KDV Oranı (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value)}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        TCMB Kurları (Snapshot)
                      </span>
                      <span>{fxData?.sourceDate ?? "—"}</span>
                    </div>
                    <div className="mt-2 space-y-1 text-sm tabular-nums">
                      {fxLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Yükleniyor…
                        </div>
                      ) : fxError ? (
                        <div className="flex items-center gap-2 text-destructive">
                          <AlertCircle className="h-3.5 w-3.5" /> {fxError}
                        </div>
                      ) : fxData ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">EUR/TRY</span>
                            <span className="font-medium">{tryFormatter.format(fxData.eurTry)} ₺</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">USD/TRY</span>
                            <span className="font-medium">{tryFormatter.format(fxData.usdTry)} ₺</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">EUR/USD</span>
                            <span className="font-medium">{parityFormatter.format(fxData.eurUsd)} $</span>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              {/* Hazırlayan */}
              <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Hazırlayan
                </h2>
                <FormField
                  control={form.control}
                  name="preparer_full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ad Soyad</FormLabel>
                      <FormControl>
                        <Input placeholder="Ad Soyad" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              {/* Talep metni */}
              <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Talep Metni
                </h2>
                <FormField
                  control={form.control}
                  name="request_content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Talep Edilen</FormLabel>
                      <FormControl>
                        <Textarea rows={3} placeholder="Talebin kapsamını yazın" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="request_amount_text"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Talep Tutarı</FormLabel>
                        <FormControl>
                          <Input placeholder="Örn. 250.000 TL + KDV" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="request_reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Talep Gerekçesi</FormLabel>
                      <FormControl>
                        <Textarea rows={3} placeholder="Bu talebin gerekçesini yazın" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notlar (opsiyonel)</FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder="Eklemek istediğiniz notlar" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              {/* Mukayese matrisi */}
              <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Mukayese Matrisi
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Kalemler ile firmaların kesişiminde birim fiyatı girin.
                  </p>
                </div>
                <MatrixEditor
                  items={matrixItems}
                  onItemsChange={setMatrixItems}
                  suppliers={matrixSuppliers}
                  onSuppliersChange={setMatrixSuppliers}
                  prices={matrixPrices}
                  onPricesChange={setMatrixPrices}
                  currency={form.watch("form_currency")}
                  kdvRate={Number(form.watch("kdv_rate")) || 0}
                  disabled={isSubmitting}
                />
              </section>

              {/* Ek Dosyalar */}
              {attachmentConfigId && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {attachmentLabel}
                  </h2>
                  {pendingFiles.length > 0 && (
                    <div className="space-y-1.5">
                      {pendingFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate">{file.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              ({(file.size / 1024).toFixed(0)} KB)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                            disabled={isSubmitting}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {pendingFiles.length < maxFiles && (
                    <label className={`flex items-center gap-2 w-full cursor-pointer rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-muted/30 transition-colors ${isSubmitting ? "opacity-50 pointer-events-none" : ""}`}>
                      <Upload className="h-4 w-4 shrink-0" />
                      <span>{allowedMimeTypes ? "Dosya seç" : "Dosya seç (Tüm dosya türleri)"} — maks {Math.round(maxFileSizeBytes / 1048576)} MB · en fazla {maxFiles} dosya</span>
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept={allowedMimeTypes ? allowedMimeTypes.join(",") : undefined}
                        onChange={handleFileChange}
                        disabled={isSubmitting}
                      />
                    </label>
                  )}
                </section>
              )}

              {/* İmza paneli */}
              <SignaturePanel
                signatureText={signatureInfo.signatureText}
                signatureFont={signatureInfo.signatureFont}
                isAccepted={signatureAccepted}
                onAcceptChange={setSignatureAccepted}
                title="TALEP İMZASI"
                description="Bu mukayese formu talebini imzanızla göndereceksiniz:"
                disabled={isSubmitting}
              />

              {/* Butonlar */}
              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                  İptal
                </Button>
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  title={
                    !matrixReady
                      ? "En az bir kalem satırı ve bir firma sütunu eklemelisiniz"
                      : undefined
                  }
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditMode ? "Talebi Güncelle ve Gönder" : "İmzala ve Talebi Gönder"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
