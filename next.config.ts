import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents (Next 16 deneysel) kaldırıldı: Fluid Compute'ta yanıt
  // stream/flush davranışını değiştirip HTTP/2 framing sorunlarına katkıda
  // bulunabiliyor. Kodda "use cache" kullanımı yok, o yüzden kaldırmak güvenli.
};

export default nextConfig;
