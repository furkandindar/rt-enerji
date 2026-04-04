"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Stamp, Upload, X, FileText } from "lucide-react";

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

interface StampOption {
  id: string;
  name: string;
  image_path: string;
  width: number;
  height: number;
}

const POSITION_OPTIONS = [
  { value: "bottom-right", label: "Sağ Alt" },
  { value: "bottom-left", label: "Sol Alt" },
  { value: "top-right", label: "Sağ Üst" },
  { value: "top-left", label: "Sol Üst" },
  { value: "center", label: "Orta" },
] as const;

export default function NewStampApprovalPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [stamps, setStamps] = useState<StampOption[]>([]);
  const [selectedStampId, setSelectedStampId] = useState<string>("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [selectedPages, setSelectedPages] = useState<string>("all");
  const [pageMode, setPageMode] = useState<"all" | "specific">("all");
  const [specificPages, setSpecificPages] = useState<string>("");
  const [stampPosition, setStampPosition] = useState<string>("bottom-right");
  const [subject, setSubject] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Kaşeleri yükle
  useEffect(() => {
    const loadStamps = async () => {
      try {
        const response = await fetch("/api/stamps");
        if (response.ok) {
          const data = await response.json();
          setStamps(data);
          if (data.length === 1) {
            setSelectedStampId(data[0].id);
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
    e.target.value = "";
  };

  const canSubmit = pdfFile && selectedStampId && subject.trim() && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("pdf_file", pdfFile);
      formData.append("stamp_id", selectedStampId);
      formData.append("stamp_position", stampPosition);
      formData.append("subject", subject.trim());
      formData.append(
        "selected_pages",
        pageMode === "all" ? "all" : specificPages.trim()
      );
      if (description.trim()) {
        formData.append("description", description.trim());
      }

      const response = await fetch("/api/stamp-approval", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Talep oluşturulamadı");
      }

      toast.success("Kaşeli belge talebi başarıyla oluşturuldu");
      router.push("/my-requests");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kaşeli Belge Onayı</h1>
        <p className="text-muted-foreground">
          PDF belgenize kaşe basılması için onay talebi oluşturun
        </p>
      </div>

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
                    <span className="text-sm truncate">{pdfFile.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({(pdfFile.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPdfFile(null)}
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
            </div>

            {/* Kaşe Seçimi */}
            <div className="space-y-2">
              <Label>Kaşe *</Label>
              {stamps.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sistemde tanımlı kaşe bulunamadı.
                </p>
              ) : (
                <Select value={selectedStampId} onValueChange={setSelectedStampId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kaşe seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {stamps.map((stamp) => (
                      <SelectItem key={stamp.id} value={stamp.id}>
                        {stamp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Kaşe Konumu */}
            <div className="space-y-2">
              <Label>Kaşe Konumu</Label>
              <Select value={stampPosition} onValueChange={setStampPosition}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_OPTIONS.map((pos) => (
                    <SelectItem key={pos.value} value={pos.value}>
                      {pos.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                Talebi Gönder
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

