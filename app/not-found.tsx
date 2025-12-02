import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-muted p-6">
          <FileQuestion className="h-12 w-12 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">404</h1>
          <h2 className="text-xl font-semibold text-muted-foreground">
            Sayfa Bulunamadı
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Aradığınız sayfa mevcut değil
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/">Ana Sayfaya Dön</Link>
          </Button>
          {/* <Button variant="outline" asChild>
            <Link href="/unit-types">Birim Tipleri</Link>
          </Button> */}
        </div>
      </div>
    </div>
  );
}

