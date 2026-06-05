import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents (Next 16 deneysel) kaldırıldı: Fluid Compute'ta yanıt
  // stream/flush davranışını değiştirip HTTP/2 framing sorunlarına katkıda
  // bulunabiliyor. Kodda "use cache" kullanımı yok, o yüzden kaldırmak güvenli.

  // Mobil/başka cihazdan yerel ağ üzerinden dev sunucusuna erişirken
  // Next.js'in cross-origin uyarısını engeller. Tüm yerel ağ alt ağlarını
  // kapsayacak şekilde wildcard kullanıldı (sadece dev'i etkiler, prod'u değil).
  allowedDevOrigins: ["192.168.1.*", "192.168.0.*", "10.0.0.*"],
};

export default nextConfig;
