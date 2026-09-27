"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Stamp, Upload, X, FileText, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RevisionNoticeForRequest } from "@/components/my-requests/revision-notice";
import type { StampPositionValue } from "@/components/stamp-position-picker";
import {
  DEFAULT_PRESET,
  PRESET_ORDER,
  type Ratio,
  type StampPreset,
} from "@/lib/stamp-position/presets";

// pdfjs SSR ile uyumsuz; picker sadece client'ta yüklenmeli.
const StampPositionPicker = dynamic(
  () => import("@/components/stamp-position-picker"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-40 rounded-md border bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

interface StampOption {
  id: string;
  name: string;
  image_path: string;
  width: number;
  height: number;
}

/** Edit modunda mevcut talepten yüklenen PDF + sayfa/konum seçimi (geri alma için). */
interface OriginalPdfSnapshot {
  file: File;
  pageMode: "all" | "specific";
  specificPages: string;
  position: StampPositionValue;
}

const EMPTY_POSITION: StampPositionValue = { defaultRatio: null, overrides: {} };

function parseSpecificPages(input: string): number[] {
  return input
    .split(",")
    .map((v) => parseInt(v.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 1);
}

/** DB'den gelen ratio değerini (number veya numeric string) 0-1 sayıya çevirir. */
function toRatioNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

/** stamp_position_overrides (Json) → picker override map'i; geçersiz girişler atılır. */
function toOverrides(raw: unknown): Record<string, Ratio> {
  const result: Record<string, Ratio> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const pageNum = Number(key);
    if (!Number.isInteger(pageNum) || pageNum < 1) continue;
    if (!value || typeof value !== "object") continue;
    const v = value as { x?: unknown; y?: unknown };
    const x = toRatioNumber(v.x);
    const y = toRatioNumber(v.y);
    if (x === null || y === null) continue;
    result[String(pageNum)] = { x, y };
  }
  return result;
}

interface EditStampRequest {
  stamp_id?: string;
  original_pdf_path?: string | null;
  selected_pages?: string | null;
  stamp_position?: string | null;
  stamp_x_ratio?: number | string | null;
  stamp_y_ratio?: number | string | null;
  stamp_position_overrides?: unknown;
  subject?: string | null;
  description?: string | null;
  stamp?: StampOption | StampOption[] | null;
}

export default function NewStampApprovalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingEditData, setLoadingEditData] = useState<boolean>(isEditMode);

  // Form state
  const [stamps, setStamps] = useState<StampOption[]>([]);
  const [selectedStampId, setSelectedStampId] = useState<string>("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pageMode, setPageMode] = useState<"all" | "specific">("all");
  const [specificPages, setSpecificPages] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [stampPositionValue, setStampPositionValue] = useState<StampPositionValue>(EMPTY_POSITION);

  // Edit modu: mevcut talebin kaşesi (pasife alınmışsa aktif listede yoktur),
  // legacy preset (ratio'suz eski kayıtlar), mevcut PDF snapshot'ı ve PDF'in
  // değiştirilip değiştirilmediği (değiştiyse PATCH'e yeni dosya gönderilir).
  const [editStamp, setEditStamp] = useState<StampOption | null>(null);
  const [initialPreset, setInitialPreset] = useState<StampPreset>(DEFAULT_PRESET);
  const [originalPdf, setOriginalPdf] = useState<OriginalPdfSnapshot | null>(null);
  const [originalPdfLoadFailed, setOriginalPdfLoadFailed] = useState(false);
  const [pdfReplaced, setPdfReplaced] = useState(false);

  const stampOptions = useMemo<StampOption[]>(() => {
    if (editStamp && !stamps.some((s) => s.id === editStamp.id)) {
      return [...stamps, editStamp];
    }
    return stamps;
  }, [stamps, editStamp]);

  const selectedStamp = useMemo(
    () => stampOptions.find((s) => s.id === selectedStampId) || null,
    [stampOptions, selectedStampId]
  );

  const pickerSelectedPages = useMemo<number[] | undefined>(() => {
    if (pageMode !== "specific") return undefined;
    const parsed = parseSpecificPages(specificPages);
    return parsed.length > 0 ? parsed : undefined;
  }, [pageMode, specificPages]);

  // Kaşeleri yükle
  useEffect(() => {
    const loadStamps = async () => {
      try {
        const response = await fetch("/api/stamps");
        if (response.ok) {
          const data = await response.json();
          setStamps(data);
          if (data.length === 1) {
            // Edit modunda talepten gelen seçim korunur (önce yüklenmişse ezilmez)
            setSelectedStampId((prev) => prev || data[0].id);
          }
        }
      } catch (error) {
        console.error("Error loading stamps:", error);
        toast.error("Kaşeler yüklenemedi");
      } finally {
        setIsLoading(false);
      }
    };
    loadStamps();
  }, []);

  // Edit mode — ?edit=<id> ile gelirse mevcut talebi + orijinal PDF'i yükle
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/my-requests/${editId}`);
        if (!res.ok) {
          toast.error("Talep bulunamadı");
          return;
        }
        const body = (await res.json()) as {
          workflow_definition?: { code?: string } | { code?: string }[] | null;
          stamp_request?: EditStampRequest | EditStampRequest[] | null;
        };
        const wf = Array.isArray(body.workflow_definition)
          ? body.workflow_definition[0]
          : body.workflow_definition;
        if (wf?.code !== "STAMP_APPROVAL") {
          toast.error("Bu talep kaşeli belge talebi değil");
          return;
        }
        // PostgREST 1:1 ilişkide obje veya tek elemanlı dizi dönebilir
        const sr = Array.isArray(body.stamp_request) ? body.stamp_request[0] : body.stamp_request;
        if (!sr) {
          toast.error("Talep bulunamadı");
          return;
        }

        // Orijinal PDF'i indir → picker File bekliyor
        let file: File | null = null;
        try {
          const pdfRes = await fetch(`/api/stamp-approval/${editId}/original-pdf`);
          if (pdfRes.ok) {
            const blob = await pdfRes.blob();
            const name = sr.original_pdf_path?.split("/").pop() || "belge.pdf";
            file = new File([blob], name, { type: "application/pdf" });
          }
        } catch (pdfErr) {
          console.error("Original PDF load error:", pdfErr);
        }
        if (cancelled) return;

        const stamp = Array.isArray(sr.stamp) ? sr.stamp[0] : sr.stamp;
        if (stamp) setEditStamp(stamp);
        if (sr.stamp_id) setSelectedStampId(sr.stamp_id);

        const selected = (sr.selected_pages ?? "").trim();
        const nextPageMode: "all" | "specific" = !selected || selected === "all" ? "all" : "specific";
        const nextSpecificPages = nextPageMode === "specific" ? selected : "";

        const x = toRatioNumber(sr.stamp_x_ratio);
        const y = toRatioNumber(sr.stamp_y_ratio);
        const nextPosition: StampPositionValue = {
          defaultRatio: x !== null && y !== null ? { x, y } : null,
          overrides: toOverrides(sr.stamp_position_overrides),
        };
        // Ratio'suz eski kayıt: picker ilk açılışta kayıtlı preset'i uygulasın
        if (PRESET_ORDER.includes(sr.stamp_position as StampPreset)) {
          setInitialPreset(sr.stamp_position as StampPreset);
        }

        setPageMode(nextPageMode);
        setSpecificPages(nextSpecificPages);
        setSubject(sr.subject ?? "");
        setDescription(sr.description ?? "");

        if (file) {
          setPdfFile(file);
          setStampPositionValue(nextPosition);
          setOriginalPdf({
            file,
            pageMode: nextPageMode,
            specificPages: nextSpecificPages,
            position: nextPosition,
          });
        } else {
          // Mevcut PDF'e erişilemedi (ör. yetki) — kullanıcı yeni PDF seçmeli
          setOriginalPdfLoadFailed(true);
          toast.error("Mevcut PDF yüklenemedi, lütfen PDF'i yeniden seçin");
        }
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
  }, [editId]);

  // PDF veya kaşe değişince seçilmiş konumu sıfırla — picker preset ile yeniden başlasın
  const resetStampPosition = () => setStampPositionValue(EMPTY_POSITION);

  const handleStampChange = (stampId: string) => {
    setSelectedStampId(stampId);
    resetStampPosition();
  };

  const handleRemovePdf = () => {
    setPdfFile(null);
    resetStampPosition();
    if (isEditMode) setPdfReplaced(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Sadece PDF dosyası yüklenebilir");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Dosya boyutu 20 MB'dan büyük olamaz");
      return;
    }
    setPdfFile(file);
    resetStampPosition();
    if (isEditMode) {
      // Yeni belge: eski belgenin sayfa numaraları geçersiz olabilir — sayfa
      // seçimi ve kaşe konumu yeni PDF'e göre yeniden yapılır.
      setPdfReplaced(true);
      setPageMode("all");
      setSpecificPages("");
    }
    e.target.value = "";
  };

  // Edit modu: yeni PDF seçimini geri al → mevcut PDF + kayıtlı sayfa/konum seçimi
  const handleRestoreOriginalPdf = () => {
    if (!originalPdf) return;
    setPdfFile(originalPdf.file);
    setPageMode(originalPdf.pageMode);
    setSpecificPages(originalPdf.specificPages);
    setStampPositionValue(originalPdf.position);
    setPdfReplaced(false);
  };

  const isShowingOriginalPdf = isEditMode && !!originalPdf && !pdfReplaced && pdfFile === originalPdf.file;

  const canSubmit =
    pdfFile &&
    selectedStampId &&
    subject.trim() &&
    stampPositionValue.defaultRatio !== null &&
    !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (!stampPositionValue.defaultRatio) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      // Edit modunda PDF yalnız değiştirildiyse gönderilir (PATCH'te opsiyonel)
      if (!isEditMode || pdfReplaced) {
        formData.append("pdf_file", pdfFile);
      }
      formData.append("stamp_id", selectedStampId);
      // Legacy (NOT NULL) kolon — yeni ratio alanları dolu olduğunda backend bunu yok sayar
      formData.append("stamp_position", DEFAULT_PRESET);
      formData.append("stamp_x_ratio", String(stampPositionValue.defaultRatio.x));
      formData.append("stamp_y_ratio", String(stampPositionValue.defaultRatio.y));
      // Override yoksa alan gönderilmez; PATCH'te ratio'larla birlikte gelmeyen
      // override'lar temizlenir (POST ile aynı "yoksa null" semantiği)
      if (Object.keys(stampPositionValue.overrides).length > 0) {
        formData.append(
          "stamp_position_overrides",
          JSON.stringify(stampPositionValue.overrides)
        );
      }
      formData.append("subject", subject.trim());
      formData.append(
        "selected_pages",
        pageMode === "all" ? "all" : specificPages.trim()
      );
      if (isEditMode) {
        // Edit: açıklama silinebilsin diye boş da olsa gönderilir (PATCH → null)
        formData.append("description", description.trim());
      } else if (description.trim()) {
        formData.append("description", description.trim());
      }

      const url = isEditMode ? `/api/stamp-approval/${editId}` : "/api/stamp-approval";
      const method = isEditMode ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || (isEditMode ? "Talep güncellenemedi" : "Talep oluşturulamadı"));
      }

      if (isEditMode) {
        // Edit sonrası otomatik resubmit → talep onay akışına geri girer
        const resubmitRes = await fetch(`/api/requests/${editId}/resubmit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!resubmitRes.ok) {
          const err = await resubmitRes.json().catch(() => ({}));
          throw new Error(err.error || "Talep güncellendi ama yeniden gönderilemedi");
        }
        toast.success("Talep güncellendi ve onaya gönderildi");
      } else {
        toast.success("Kaşeli belge talebi başarıyla oluşturuldu");
      }
      router.push("/my-requests");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || loadingEditData) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEditMode ? "Talebi Güncelle" : "Kaşeli Belge Onayı"}
        </h1>
        <p className="text-muted-foreground">
          {isEditMode
            ? "Kaşeli belge talebinin bilgilerini güncelleyin"
            : "PDF belgenize kaşe basılması için onay talebi oluşturun"}
        </p>
      </div>

      {/* Revize bandı: yalnız talep REVISION_REQUESTED iken görünür (boşsa gizlenir) */}
      {isEditMode && (
        <div className="max-w-2xl empty:hidden">
          <RevisionNoticeForRequest requestId={editId} />
        </div>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stamp className="h-5 w-5" />
            Belge ve Kaşe Bilgileri
          </CardTitle>
          <CardDescription>
            Kaşelenecek belgeyi yükleyin ve kaşe ayarlarını seçin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* PDF Dosyası */}
            <div className="space-y-2">
              <Label>PDF Belgesi *</Label>
              {pdfFile ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">
                      {isShowingOriginalPdf ? "Mevcut belge" : pdfFile.name}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({(pdfFile.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemovePdf}
                    title={isShowingOriginalPdf ? "PDF'i değiştir" : undefined}
                    className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 w-full cursor-pointer rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground hover:bg-muted/30 transition-colors justify-center">
                  <Upload className="h-5 w-5 shrink-0" />
                  <span>PDF dosyası seçin — maks 20 MB</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="application/pdf"
                    onChange={handleFileChange}
                  />
                </label>
              )}
              {isEditMode && isShowingOriginalPdf && (
                <p className="text-xs text-muted-foreground">
                  Talepteki mevcut belge. Farklı bir PDF yüklemek için kaldırıp yenisini seçin.
                </p>
              )}
              {isEditMode && pdfReplaced && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    Yeni belge seçildiğinde kaşe konumu ve sayfa seçimi sıfırlanır; yeni PDF&apos;e göre yeniden belirleyin.
                  </span>
                  {originalPdf && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={handleRestoreOriginalPdf}
                      disabled={isSubmitting}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      Mevcut belgeye dön
                    </Button>
                  )}
                </div>
              )}
              {isEditMode && originalPdfLoadFailed && !pdfFile && (
                <p className="text-xs text-destructive">
                  Talepteki mevcut PDF yüklenemedi. Devam etmek için PDF&apos;i yeniden seçin.
                </p>
              )}
            </div>

            {/* Kaşe Seçimi */}
            <div className="space-y-2">
              <Label>Kaşe *</Label>
              {stampOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sistemde tanımlı kaşe bulunamadı.
                </p>
              ) : (
                <Select value={selectedStampId} onValueChange={handleStampChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kaşe seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {stampOptions.map((stamp) => (
                      <SelectItem key={stamp.id} value={stamp.id}>
                        {stamp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Sayfa Seçimi */}
            <div className="space-y-3">
              <Label>Kaşelenecek Sayfalar</Label>
              <RadioGroup
                value={pageMode}
                onValueChange={(val) => setPageMode(val as "all" | "specific")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="pages-all" />
                  <Label htmlFor="pages-all" className="font-normal cursor-pointer">
                    Tüm sayfalar
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="specific" id="pages-specific" />
                  <Label htmlFor="pages-specific" className="font-normal cursor-pointer">
                    Belirli sayfalar
                  </Label>
                </div>
              </RadioGroup>
              {pageMode === "specific" && (
                <Input
                  placeholder="Örn: 1,3,5"
                  value={specificPages}
                  onChange={(e) => setSpecificPages(e.target.value)}
                />
              )}
            </div>

            {/* Kaşe Konumu — sürüklenebilir picker */}
            <div className="space-y-2">
              <Label>Kaşe Konumu *</Label>
              {pdfFile && selectedStamp ? (
                <StampPositionPicker
                  // Edit modunda mevcut ↔ yeni PDF arasında geçişte picker sıfırdan kurulsun
                  key={isShowingOriginalPdf ? "original-pdf" : "selected-pdf"}
                  pdfFile={pdfFile}
                  stamp={{
                    imageUrl: `/api/stamps/${selectedStamp.id}/image`,
                    widthPt: selectedStamp.width,
                    heightPt: selectedStamp.height,
                  }}
                  selectedPages={pickerSelectedPages}
                  value={stampPositionValue}
                  onChange={setStampPositionValue}
                  initialPreset={initialPreset}
                />
              ) : (
                <div className="flex items-center justify-center h-32 rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground">
                  Kaşe konumunu belirlemek için önce PDF ve kaşe seçin
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Varsayılan olarak tüm sayfalara aynı konum uygulanır. İstersen belirli bir sayfa için farklı konum tanımlayabilirsin.
              </p>
            </div>

            {/* Konu */}
            <div className="space-y-2">
              <Label>Konu / Başlık *</Label>
              <Input
                placeholder="Belgenin konusunu yazın..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            {/* Açıklama */}
            <div className="space-y-2">
              <Label>Açıklama</Label>
              <Textarea
                placeholder="Opsiyonel — belge hakkında açıklama ekleyin..."
                className="min-h-20"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Butonlar */}
            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                İptal
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditMode ? "Talebi Güncelle ve Gönder" : "Talebi Gönder"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
