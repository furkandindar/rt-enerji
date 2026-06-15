import type { MetadataRoute } from "next";

// Şirket içi yönetim paneli — tüm arama motoru botlarını engelle.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
