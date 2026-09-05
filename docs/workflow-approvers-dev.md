# Workflow Onaycı Haritası

Kaynak: Supabase `ghrfpfapklbswydmyutb` projesindeki `workflow_definitions`, `workflow_steps`, `positions`, `employee_positions`, `employees` tabloları. Oluşturulma tarihi: 2026-05-09. Tüm listelenen workflow tanımları aktiftir.

## Notlar
- `REQUESTER`: Talebi/formu oluşturan kullanıcı.
- `UNIT_HEAD`: Talep sahibinin bağlı olduğu birimin aktif birim amiri; talep sahibine göre dinamik çözülür.
- `DYNAMIC_USER_LIST`: Talep oluşturulurken seçilen ilgili kişiler; workflow tanımında sabit kişi yoktur.
- `STATIC_POSITION`: Sabit pozisyon; “Aktif kişi” alanı, ilgili pozisyona bugün itibarıyla aktif/primary atanmış çalışanı gösterir.

## Özet
| Workflow | Kod | Adım Sayısı | Onay Zinciri |
|---|---:|---:|---|
| Fazla Mesai Onay Formu | `OVERTIME` | 2 | Talep Eden/İK → Genel Müdür |
| Harcama Formu | `EXPENSE_FORM` | 4 | Talep Eden → Birim Amiri → Muhasebe → Genel Müdür |
| İşe Giriş Takip Formu | `EMPLOYEE_ONBOARDING` | 7 | İK → Genel Müdür → İK → Muhasebe → İdari İşler → Finans → Genel Müdür |
| İşten Çıkış Takip Formu | `EMPLOYEE_SEPARATION` | 9 | İK → Genel Müdür → İK → GMY → Muhasebe → İdari İşler → Finans Uzmanı → Finans Müdürü → Genel Müdür |
| Kaşeli Belge Onayı | `STAMP_APPROVAL` | 2 | Talep Eden → Genel Müdür |
| Kısa Süreli İzin Talebi | `SHORT_LEAVE` | 4 | Talep Eden → Bölüm Müdürü → Personel Müdürlüğü → Genel Koordinatör |
| Maaş Avans Talebi | `SALARY_ADVANCE` | 6 | Talep Eden → Personel Müdürlüğü → Muhasebe → Finans → Genel Koordinatör → Yönetim Kurulu Başkanı |
| Mukayese Formu | `COMPARISON_FORM` | 4 | Talep Eden → Birim Müdürü → Genel Koordinatör → Yönetim Kurulu Başkanı |
| Olur Yazısı | `APPROVAL_LETTER` | 5 | Talep Eden → Birim Amiri → Hukuk Müşaviri → Genel Koordinatör → Yönetim Kurulu Başkanı |
| Onay Kapağı Finans | `FINANCE_APPROVAL_COVER` | 5 | Talep Eden → İlgili Kişiler → Finans Müdürü → Genel Müdür → Yönetim Kurulu Başkanı |
| Onay Kapağı Muhasebe | `ACCOUNTING_APPROVAL_COVER` | 5 | Talep Eden → İlgili Kişiler → Muhasebe Müdürü → Genel Müdür → Yönetim Kurulu Başkanı |
| Şehir İçi/Dışı Görev Formu | `TRAVEL_ASSIGNMENT` | 6 | Talep Eden → Birim Amiri → İdari İşler → Muhasebe → Genel Koordinatör → Göreve Giden (Tamamlama) |
| Talep Formu | `REQUEST_FORM` | 4 | Talep Eden → Bölüm Müdürü → Genel Müdür → Yönetim Kurulu Başkanı |
| Yıllık İzin Talebi | `ANNUAL_LEAVE` | 5 | Talep Eden → Bölüm Müdürü → Personel Müdürlüğü → Muhasebe → Genel Koordinatör |

## Workflow Detayları

### Fazla Mesai Onay Formu (`OVERTIME`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | İnsan Kaynakları | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | Genel Müdür | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |

### Harcama Formu (`EXPENSE_FORM`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | Talep Eden | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | Birim Amiri | `UNIT_HEAD` | Talep sahibinin birim amiri | Dinamik |
| 3 | Muhasebe | `STATIC_POSITION` | Muhasebe Müdürü (`M100`) | Muhasebe Müdürü Kullanici |
| 4 | Genel Müdür | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |

### İşe Giriş Takip Formu (`EMPLOYEE_ONBOARDING`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | İnsan Kaynakları | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | Adım 2 | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |
| 3 | İnsan Kaynakları | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 4 | Adım 4 | `STATIC_POSITION` | Muhasebe Müdürü (`M100`) | Muhasebe Müdürü Kullanici |
| 5 | Adım 5 | `STATIC_POSITION` | İdari İşler Müdürü (`IDR100`) | İdari İşler Müdürü Kullanici |
| 6 | Adım 6 | `STATIC_POSITION` | Finans Uzmanı (`F300`) | Finans Uzmanı Kullanici |
| 7 | Adım 7 | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |

### İşten Çıkış Takip Formu (`EMPLOYEE_SEPARATION`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | İnsan Kaynakları | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | Adım 2 | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |
| 3 | İnsan Kaynakları | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 4 | Adım 4 | `STATIC_POSITION` | Genel Müdür Yardımcısı (`GMY100`) | Genel Müdür Yardımcısı Kullanici |
| 5 | Adım 5 | `STATIC_POSITION` | Muhasebe Müdürü (`M100`) | Muhasebe Müdürü Kullanici |
| 6 | Adım 6 | `STATIC_POSITION` | İdari İşler Müdürü (`IDR100`) | İdari İşler Müdürü Kullanici |
| 7 | Adım 7 | `STATIC_POSITION` | Finans Uzmanı (`F300`) | Finans Uzmanı Kullanici |
| 8 | Adım 8 | `STATIC_POSITION` | Finans Müdürü (`F100`) | Finans Müdürü Kullanici |
| 9 | Adım 9 | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |

### Kaşeli Belge Onayı (`STAMP_APPROVAL`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | Talep Eden | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | Genel Müdür | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |

### Kısa Süreli İzin Talebi (`SHORT_LEAVE`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | Talep Eden | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | Bölüm Müdürü | `UNIT_HEAD` | Talep sahibinin birim amiri | Dinamik |
| 3 | Personel Müdürlüğü | `STATIC_POSITION` | İnsan Kaynakları Şefi (`IK200`) | İnan Kaynakları Şefi Kullanici |
| 4 | Genel Koordinatör | `STATIC_POSITION` | Genel Müdür Yardımcısı (`GMY100`) | Genel Müdür Yardımcısı Kullanici |

### Maaş Avans Talebi (`SALARY_ADVANCE`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | Talep Eden | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | Personel Müdürlüğü | `STATIC_POSITION` | İnsan Kaynakları Şefi (`IK200`) | İnan Kaynakları Şefi Kullanici |
| 3 | Muhasebe Müdürlüğü | `STATIC_POSITION` | Muhasebe Müdürü (`M100`) | Muhasebe Müdürü Kullanici |
| 4 | Finans Müdürlüğü | `STATIC_POSITION` | Finans Müdürü (`F100`) | Finans Müdürü Kullanici |
| 5 | Genel Koordinatör | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |
| 6 | Yönetim Kurulu Başkanı | `STATIC_POSITION` | Genel Müdür Yardımcısı (`GMY100`) | Genel Müdür Yardımcısı Kullanici |

### Mukayese Formu (`COMPARISON_FORM`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | Talep Eden | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | Birim Müdürü | `UNIT_HEAD` | Talep sahibinin birim amiri | Dinamik |
| 3 | Genel Koordinatör | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |
| 4 | Yönetim Kurulu Başkanı | `STATIC_POSITION` | Genel Müdür Yardımcısı (`GMY100`) | Genel Müdür Yardımcısı Kullanici |

### Olur Yazısı (`APPROVAL_LETTER`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | Talep Eden | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | Birim Amiri | `UNIT_HEAD` | Talep sahibinin birim amiri | Dinamik |
| 3 | Hukuk Müșaviri | `STATIC_POSITION` | Genel Müdür Yardımcısı (`GMY100`) | Genel Müdür Yardımcısı Kullanici |
| 4 | Genel Koordinatör | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |
| 5 | Yönetim Kurulu Başkanı | `STATIC_POSITION` | İdari İşler Müdürü (`IDR100`) | İdari İşler Müdürü Kullanici |

### Onay Kapağı Finans (`FINANCE_APPROVAL_COVER`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | Talep Eden | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | İlgili Kişiler | `DYNAMIC_USER_LIST` | Talep sırasında seçilen kullanıcılar | Dinamik |
| 3 | Finans Müdürü | `STATIC_POSITION` | Finans Müdürü (`F100`) | Finans Müdürü Kullanici |
| 4 | Genel Müdür | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |
| 5 | Yönetim Kurulu Başkanı (YKB imzalı tarama yükleme) | `REQUESTER` | Talep/form oluşturan kullanıcı — 2026-09-05 itibarıyla (önceki: Finans Müdürü `F100`) | Dinamik |

### Onay Kapağı Muhasebe (`ACCOUNTING_APPROVAL_COVER`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | Talep Eden | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | İlgili Kişiler | `DYNAMIC_USER_LIST` | Talep sırasında seçilen kullanıcılar | Dinamik |
| 3 | Muhasebe Müdürü | `STATIC_POSITION` | Muhasebe Müdürü (`M100`) | Muhasebe Müdürü Kullanici |
| 4 | Genel Müdür | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |
| 5 | Yönetim Kurulu Başkanı (YKB imzalı tarama yükleme) | `REQUESTER` | Talep/form oluşturan kullanıcı — 2026-09-05 itibarıyla (önceki: Muhasebe Müdürü `M100`) | Dinamik |

### Şehir İçi/Dışı Görev Formu (`TRAVEL_ASSIGNMENT`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | Talep Eden | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | Birim Amiri | `UNIT_HEAD` | Talep sahibinin birim amiri | Dinamik |
| 3 | İdari İşler Uzmanı | `STATIC_POSITION` | İdari İşler Müdürü (`IDR100`) | İdari İşler Müdürü Kullanici |
| 4 | Muhasebe | `STATIC_POSITION` | Muhasebe Müdürü (`M100`) | Muhasebe Müdürü Kullanici |
| 5 | Genel Koordinatör | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |
| 6 | Göreve Giden (Tamamlama) | `REQUESTER` | Talep/form oluşturan kullanıcı — 2026-07-05 itibarıyla (önceki: Genel Müdür Yardımcısı `GMY100`) | Dinamik |

### Talep Formu (`REQUEST_FORM`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | Talep Eden | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | Bölüm Müdürü | `UNIT_HEAD` | Talep sahibinin birim amiri | Dinamik |
| 3 | Genel Müdür | `STATIC_POSITION` | Genel Müdür/CEO (`GM100`) | Bekir Korkmaz |
| 4 | Yönetim Kurulu Başkanı | `STATIC_POSITION` | Genel Müdür Yardımcısı (`GMY100`) | Genel Müdür Yardımcısı Kullanici |

### Yıllık İzin Talebi (`ANNUAL_LEAVE`)
| Sıra | Adım | Tip | Pozisyon / Onaycı | Aktif kişi |
|---:|---|---|---|---|
| 1 | Talep Eden | `REQUESTER` | Talep/form oluşturan kullanıcı | Dinamik |
| 2 | Bölüm Müdürü | `UNIT_HEAD` | Talep sahibinin birim amiri | Dinamik |
| 3 | Personel Müdürlüğü | `STATIC_POSITION` | İnsan Kaynakları Şefi (`IK200`) | İnan Kaynakları Şefi Kullanici |
| 4 | Muhasebe Müdürlüğü | `STATIC_POSITION` | Muhasebe Müdürü (`M100`) | Muhasebe Müdürü Kullanici |
| 5 | Genel Koordinatör | `STATIC_POSITION` | Genel Müdür Yardımcısı (`GMY100`) | Genel Müdür Yardımcısı Kullanici |
