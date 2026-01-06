"use client";

import { useRef, useState, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Save, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadSignature, deleteSignature, getSignatureUrl } from "@/lib/storage/upload-signature";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface SignatureManagerProps {
  employeeId: string;
  currentSignaturePath: string | null;
}

export function SignatureManager({ employeeId, currentSignaturePath }: SignatureManagerProps) {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Mevcut imzayı yükle - her zaman storage'dan kontrol et
  useEffect(() => {
    loadSignature();
  }, [employeeId]);

  const loadSignature = async () => {
    try {
      const url = await getSignatureUrl(employeeId, supabase);
      setSignatureUrl(url);
    } catch (error) {
      console.error("Error loading signature:", error);
    }
  };

  const handleClear = () => {
    sigCanvas.current?.clear();
  };

  const handleSave = async () => {
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
      toast.error("Lütfen önce imzanızı çizin");
      return;
    }

    setIsLoading(true);
    try {
      // Canvas'tan data URL al
      const dataUrl = sigCanvas.current.toDataURL("image/png");

      // Storage'a yükle
      const filePath = await uploadSignature({
        employeeId,
        signatureDataUrl: dataUrl,
        supabase,
      });

      // Database'i güncelle
      const { error: updateError } = await supabase
        .from("employees")
        .update({ signature_path: filePath })
        .eq("id", employeeId);

      if (updateError) throw updateError;

      toast.success("İmza başarıyla kaydedildi");
      setIsEditing(false);
      router.refresh();
      await loadSignature();
    } catch (error) {
      console.error("Error saving signature:", error);
      toast.error("İmza kaydedilemedi");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("İmzanızı silmek istediğinizden emin misiniz?")) {
      return;
    }

    setIsLoading(true);
    try {
      // Storage'dan sil
      await deleteSignature(employeeId, supabase);

      // Database'i güncelle
      const { error: updateError } = await supabase
        .from("employees")
        .update({ signature_path: null })
        .eq("id", employeeId);

      if (updateError) throw updateError;

      toast.success("İmza silindi");
      setSignatureUrl(null);
      router.refresh();
    } catch (error) {
      console.error("Error deleting signature:", error);
      toast.error("İmza silinemedi");
    } finally {
      setIsLoading(false);
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-4">
        <div className="border-2 border-dashed rounded-lg p-4 bg-muted/50">
          <SignatureCanvas
            ref={sigCanvas}
            canvasProps={{
              className: "w-full h-40 bg-white rounded cursor-crosshair",
            }}
            backgroundColor="white"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="mr-2 h-4 w-4" />
            Kaydet
          </Button>
          <Button variant="outline" onClick={handleClear} disabled={isLoading}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Temizle
          </Button>
          <Button
            variant="ghost"
            onClick={() => setIsEditing(false)}
            disabled={isLoading}
          >
            İptal
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          İmzanızı fare veya dokunmatik ekran ile çizin
        </p>
      </div>
    );
  }

  if (signatureUrl) {
    return (
      <div className="space-y-4">
        <div className="border rounded-lg p-4 bg-muted/50">
          <img
            src={signatureUrl}
            alt="İmza"
            className="h-40 object-contain mx-auto"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Düzenle
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
            <Trash2 className="mr-2 h-4 w-4" />
            Sil
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/50">
        <p className="text-sm text-muted-foreground mb-4">
          Henüz bir imza oluşturmadınız
        </p>
        <Button onClick={() => setIsEditing(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          İmza Oluştur
        </Button>
      </div>
    </div>
  );
}

