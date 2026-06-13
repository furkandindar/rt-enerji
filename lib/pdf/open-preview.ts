/**
 * Dokunmatik (mobil/tablet) cihaz mı? Bu cihazlarda PDF'i iframe'li dialog yerine
 * yeni sekmede açıyoruz: tarayıcının tam ekran native PDF görüntüleyicisi pinch/
 * zoom'u doğru yönetiyor. (iframe içindeki native viewer mobilde zoom hareketini
 * yakalamıyor; hareket sayfaya kaçıp tüm siteyi zoomluyordu.)
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * PDF önizlemeyi aç: dokunmatik cihazda yeni sekmede (native tam ekran viewer),
 * masaüstünde verilen dialog'u açar.
 *
 * ÖNEMLİ: window.open mutlaka kullanıcı tıklaması (gesture) içinde çağrılmalı,
 * yoksa mobil tarayıcılar popup olarak engelliyor. Bu yüzden bu fonksiyon
 * trigger butonlarının onClick'inden senkron çağrılır — dialog effect'inden değil.
 */
export function openPdfPreview(previewUrl: string, openDialog: () => void): void {
  if (isTouchDevice()) {
    const w = window.open(previewUrl, "_blank");
    if (w) w.opener = null;
  } else {
    openDialog();
  }
}
