import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AuthCodeError() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Giriş Hatası</CardTitle>
            <CardDescription>
              Giriş işlemi sırasında bir hata oluştu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Microsoft hesabınızla giriş yaparken bir sorun oluştu. Lütfen
                tekrar deneyin.
              </p>
              <Button asChild className="w-full">
                <Link href="/auth/login">Tekrar Dene</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

