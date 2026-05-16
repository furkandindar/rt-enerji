# SharePoint Kurulum Talimatları — RT-Enerji Talep Yönetim Sistemi

## Genel Bilgi

Talep Yönetim Sistemi'nin oluşturduğu PDF belgelerin kurumsal arşiv amacıyla SharePoint ortamına otomatik yüklenmesi için iki adımlık bir yapılandırma gerekmektedir. `Sites.Selected` admin consent'i tarafınızca tamamlanmış olup, kalan adımlar aşağıda sıralanmıştır.

Toplam tahmini süre: **15 dakika**. İşlemler ekran paylaşımı eşliğinde de yürütülebilir; tercih durumunda lütfen bilgi veriniz.

İki ayrı ortam (geliştirme ve canlı) için bağımsız SharePoint site'ları oluşturulacak ve her bir site'a yalnızca kendisine ait uygulamanın yazma yetkisi tanımlanacaktır. Bu yapı, uygulamanın yalnızca belirlenen alana erişmesini sağlayarak en az ayrıcalık (least privilege) güvenlik prensibini karşılamaktadır.

---

## Bölüm A — SharePoint Site'larının Oluşturulması

Bu bölüm SharePoint Admin Center üzerinden gerçekleştirilecektir.

1. https://rtenerji-admin.sharepoint.com/ adresine erişim sağlayınız.
   - Adresin tenant'a göre farklılaşması durumunda, Office.com üzerinden SharePoint uygulamasına geçiş yapıp **Admin** bağlantısı izlenebilir.
2. Sol menüden **Sites → Active sites** sekmesine geçiniz.
3. Üst menüden **+ Create → Team site (Microsoft 365 grubu)** seçeneğini seçiniz.
4. Birinci site'ın bilgilerini giriniz:
   - **Site adı:** RT-Enerji Talepler Dev
   - **Site URL'si:** RTEnerjiTalepler-Dev
   - **Privacy:** Private
   - Diğer ayarlar varsayılan olarak bırakılabilir.
5. Site oluşturma işlemi tamamlandıktan sonra Active sites listesine dönünüz.
6. Aynı adımlarla ikinci site'ı oluşturunuz:
   - **Site adı:** RT-Enerji Talepler
   - **Site URL'si:** RTEnerjiTalepler
   - **Privacy:** Private

Oluşturulan iki site'ın tam URL'leri kayıt altına alınmalıdır. Beklenen format:

- `https://rtenerji.sharepoint.com/sites/RTEnerjiTalepler-Dev`
- `https://rtenerji.sharepoint.com/sites/RTEnerjiTalepler`

---

## Bölüm B — Uygulamalara Site Bazlı Yazma Yetkisi Tanımlanması

`Sites.Selected` izin modelinin gereği olarak, her bir uygulamaya hangi site'larda yazma yetkisi olduğu ayrıca tanımlanmalıdır. Bu işlem Microsoft tarafından sağlanan **Graph Explorer** web aracı üzerinden gerçekleştirilecektir.

Graph Explorer komut satırı veya kod gerektirmemekte olup, ilgili çağrıların hazır şablonları aşağıda sunulmuştur.

### B.0 — Graph Explorer Hazırlığı (tek seferlik)

1. https://developer.microsoft.com/en-us/graph/graph-explorer adresine erişim sağlayınız.
2. Sağ üst köşeden **Sign in** seçeneği ile yönetici hesabınızla oturum açınız.
3. Sol panelde **Modify permissions** sekmesine geçiniz.
4. Listede yer alan `Sites.FullControl.All` izninin yanındaki **Consent** bağlantısına tıklayınız ve açılan ekranda **Accept** seçeneğini onaylayınız.
   - Bu işlem, Graph Explorer üzerinden site bazlı izin atamalarının gerçekleştirilebilmesi için gereklidir.

### B.1 — Geliştirme (Dev) Site ID'sinin Alınması

1. Üst menüden HTTP metodunu **GET** olarak seçiniz.
2. URL alanına aşağıdaki adresi giriniz:
   ```
   https://graph.microsoft.com/v1.0/sites/rtenerji.sharepoint.com:/sites/RTEnerjiTalepler-Dev
   ```
3. **Run query** butonuna tıklayınız.
4. Yanıt panelinde dönen JSON içerisinde `"id"` alanını bulup tam değerini kopyalayınız. Beklenen format:
   ```
   rtenerji.sharepoint.com,abc12345-...,def67890-...
   ```

### B.2 — Geliştirme (Dev) Uygulamasına Yetki Atanması

1. HTTP metodunu **POST** olarak değiştiriniz.
2. URL alanına aşağıdaki adresi giriniz (`<SITE_ID>` yerine B.1 adımında elde edilen değer yerleştirilmelidir):
   ```
   https://graph.microsoft.com/v1.0/sites/<SITE_ID>/permissions
   ```
3. **Request body** sekmesine geçiniz ve aşağıdaki içeriği yapıştırınız:
   ```json
   {
     "roles": ["write"],
     "grantedToIdentities": [
       {
         "application": {
           "id": "6a38b6cf-aefb-4ae3-9365-4ef7b52fcc29",
           "displayName": "RT-Enerji Dev App"
         }
       }
     ]
   }
   ```
4. **Run query** butonuna tıklayınız.
5. Yanıt kodunun **201 Created** olması beklenmektedir.

### B.3 — Canlı (Prod) Site ID'sinin Alınması

1. HTTP metodunu yeniden **GET** olarak seçiniz.
2. URL alanına aşağıdaki adresi giriniz:
   ```
   https://graph.microsoft.com/v1.0/sites/rtenerji.sharepoint.com:/sites/RTEnerjiTalepler
   ```
3. **Run query** butonuna tıklayınız.
4. Yanıttan `"id"` değerini kopyalayınız.

### B.4 — Canlı (Prod) Uygulamasına Yetki Atanması

1. HTTP metodunu **POST** olarak değiştiriniz.
2. URL alanına aşağıdaki adresi giriniz (`<PROD_SITE_ID>` yerine B.3 adımında elde edilen değer yerleştirilmelidir):
   ```
   https://graph.microsoft.com/v1.0/sites/<PROD_SITE_ID>/permissions
   ```
3. **Request body** sekmesine aşağıdaki içeriği yapıştırınız:
   ```json
   {
     "roles": ["write"],
     "grantedToIdentities": [
       {
         "application": {
           "id": "eecea232-1b49-436e-bd8d-54f41edcafb9",
           "displayName": "RT-Enerji Prod App"
         }
       }
     ]
   }
   ```
4. **Run query** butonuna tıklayınız.
5. Yanıt kodunun **201 Created** olması beklenmektedir.

---

## Bölüm C — Geri Bildirim

İşlemler tamamlandıktan sonra aşağıdaki bilgilerin tarafımıza iletilmesi rica olunur:

1. Geliştirme (Dev) site URL'si — tam adres
2. Canlı (Prod) site URL'si — tam adres
3. B.2 ve B.4 adımlarındaki POST çağrılarının yanıt kodları (başarı durumunda 201; aksi durumda hata mesajının ekran görüntüsü)

Bu bilgiler alındıktan sonra uygulama tarafındaki entegrasyon adımlarına devam edilecektir.

---

## Notlar

- İşlemler sırasında herhangi bir adımda tereddüt yaşanması durumunda lütfen iletişime geçiniz. Talep edilmesi halinde ekran paylaşımı eşliğinde adımlar birlikte yürütülebilir.
- Burada uygulanan **Sites.Selected** izin modeli, alternatif `Files.ReadWrite.All` modeline kıyasla erişim alanını yalnızca belirtilen iki site ile sınırlandırmakta olup kurumsal güvenlik standartları açısından önerilen yöntemdir.
- Site içerisindeki klasör hiyerarşisi (talep tipi, yıl, ay vb.) uygulama tarafından otomatik oluşturulacak olup manuel olarak klasör açılmasına gerek bulunmamaktadır.
