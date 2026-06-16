"use client";

import { useEffect } from "react";

// Uygulamadaki TÜM yakalanmamış render hatalarını yakalar (root layout dahil).
// Bu dosya olmadan Next.js prod'da çıplak "Application error: a client-side
// exception has occurred" ekranını gösterir ve gerçek hata gizli kalır.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // ChunkLoadError: genelde yeni bir deploy sonrası, eski HTML/sekmeyle
    // gezinen kullanıcı artık var olmayan bir chunk'ı istediğinde olur.
    // Bir kez otomatik yenileme genelde çözer (sonsuz döngüyü sessionStorage engeller).
    const isChunkError =
      error.name === "ChunkLoadError" ||
      /loading chunk [\d]+ failed/i.test(error.message) ||
      /dynamically imported module/i.test(error.message);

    if (isChunkError && typeof window !== "undefined") {
      const KEY = "rt-chunk-reload-once";
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, "1");
        window.location.reload();
        return;
      }
    }

    // Gerçek hatayı konsola bas (ileride bir hata izleme servisine de gönderilebilir).
    console.error("[GlobalError]", error.name, error.message, error.digest, error.stack);
  }, [error]);

  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#fafafa",
          color: "#18181b",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Bir şeyler ters gitti
          </h1>
          <p style={{ fontSize: 14, color: "#52525b", marginBottom: 16 }}>
            Sayfa yüklenirken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.
          </p>

          {/* Gerçek hata mesajı — destek/geliştirme için görünür */}
          <pre
            style={{
              textAlign: "left",
              fontSize: 12,
              background: "#f4f4f5",
              border: "1px solid #e4e4e7",
              borderRadius: 8,
              padding: 12,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "#3f3f46",
              marginBottom: 16,
            }}
          >
            {error.name}: {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>

          <button
            onClick={() => reset()}
            style={{
              cursor: "pointer",
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 500,
              background: "#18181b",
              color: "#fff",
            }}
          >
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  );
}
