"use client";

import { useState, type ReactNode } from "react";
import { useUser } from "@/lib/contexts/user-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PrivacyConsentGuardProps {
  children: ReactNode;
}

export function PrivacyConsentGuard({ children }: PrivacyConsentGuardProps) {
  const { user, refetchUser } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user || user.privacyAccepted) {
    return <>{children}</>;
  }

  const handleAccept = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/privacy-consent", { method: "POST" });
      if (res.ok) {
        await refetchUser();
      }
    } catch {
      // Hata durumunda tekrar denesin
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {children}
      <Dialog open={true}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gizlilik Sözleşmesi</DialogTitle>
            <DialogDescription>
              Devam etmeden önce gizlilik sözleşmesini okumanız ve onaylamanız
              gerekmektedir.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-64 rounded-md border p-4">
            <div className="text-sm text-muted-foreground space-y-4">
              <p>
                Bu gizlilik sözleşmesi, RT Enerji uygulamasını kullanırken
                kişisel verilerinizin nasıl toplandığını, işlendiğini ve
                korunduğunu açıklamaktadır.
              </p>
              <p>
                <strong>1. Toplanan Veriler</strong>
                <br />
                Uygulama üzerinden adınız, soyadınız, kurumsal e-posta
                adresiniz ve pozisyon bilgileriniz işlenmektedir.
              </p>
              <p>
                <strong>2. Verilerin Kullanım Amacı</strong>
                <br />
                Toplanan veriler yalnızca şirket içi organizasyon yönetimi,
                iş akışları ve onay süreçleri kapsamında kullanılmaktadır.
              </p>
              <p>
                <strong>3. Verilerin Korunması</strong>
                <br />
                Verileriniz güvenli sunucularda şifreli olarak saklanmakta
                ve yetkisiz erişime karşı korunmaktadır.
              </p>
              <p>
                <strong>4. Haklarınız</strong>
                <br />
                Kişisel verilerinize erişim, düzeltme ve silme haklarınız
                saklıdır. Bu haklarınızı kullanmak için İK departmanı ile
                iletişime geçebilirsiniz.
              </p>
              {/* TODO: Gerçek sözleşme metni buraya eklenecek */}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button onClick={handleAccept} disabled={isSubmitting}>
              {isSubmitting ? "Onaylanıyor..." : "Okudum ve Onaylıyorum"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
