# 🚀 Gelişmiş Yönetim Paneli ve Yapay Zeka Entegreli Microservice Projesi

## 📌 Proje Hakkında
Bu proje; Öğrenci, Okul ve İşletme olmak üzere üç farklı kullanıcı grubunun giriş yapabildiği, yetkilendirme ve CRUD işlemlerinin dinamik olarak yönetilebildiği kapsamlı bir yönetim sistemidir. Sistem tamamen microservice mimarisine uygun olarak tasarlanmış olup, asenkron iletişim, loglama, ileri seviye veritabanı işlemleri ve Yapay Zeka (AI) destekli dosya analizi özellikleri barındırmaktadır.

---

## 🛠 Kullanılan Teknolojiler ve Mimari

* **Frontend & Backend:** NextJS 16 (ReactJS / TailwindCSS) - Hem arayüz hem de sunucu taraflı işlemler için entegre kullanılmıştır.
* **Message Broker (Kuyruk Sistemi):** RabbitMQ - Servisler arası asenkron iletişim ve RPC (Remote Procedure Call) yapısı için.
* **Veritabanı:** PostgreSQL / Redis - İlişkisel veri saklama, caching ve JSON/JSONB formatında esnek veri tutma.
* **Konteynerleştirme:** Docker & Docker Compose - Tüm servislerin izole ve standart bir ortamda çalışması için.
* **Yapay Zeka Entegrasyonu:** MCP (Model Context Protocol) ve RAG (Retrieval-Augmented Generation) mimarisi.

---

## 🌟 Temel Özellikler ve Modüller

### 1. Supervisor ve Dinamik Yetkilendirme Paneli
* Sistemde Öğrenci, Okul ve İşletme olmak üzere üç ana rol bulunmaktadır.
* **Supervisor Yetkisi:** Sayfa erişimleri ve bileşen bazlı yetkilendirmeler tamamen Supervisor tarafından dinamik olarak atanıp çıkarılabilmektedir. (Örn: Öğrenci listesi ekranının işletmeye atanması).
* **CRUD Yönetimi:** Her grubun oluşturma (Create), okuma (Read), güncelleme (Update) ve silme (Delete) yetkileri Supervisor kontrolündedir.
* **Dosya Kısıtlamaları:** Kullanıcıların sisteme yükleyeceği dosyalar (txt, png, jpg, jpeg, pdf, word, excel) admin paneli üzerinden tür ve boyut bazlı kısıtlanabilmektedir.

### 2. İleri Seviye Veritabanı ve Loglama Yapısı
* **JSONB Formatı:** Veritabanında sabit alanlar (id, date vb.) dışında kalan dinamik veriler JSON/JSONB formatında tutularak maksimum esneklik sağlanmıştır.
* **Trigger, Function ve Procedure:** Veritabanı seviyesinde otomatik tetikleyiciler ve saklı yordamlar oluşturularak veri bütünlüğü ve loglama işlemleri garanti altına alınmıştır.
* **Merkezi Loglama:** Sistemdeki tüm işlemler, RabbitMQ üzerinden log servisine iletilerek kayıt altına alınmaktadır.

### 3. RabbitMQ ve RPC İletişimi
* Sistemdeki CRUD veya Log işlemlerinde RabbitMQ consumer'ları aktif olarak rol almaktadır.
* RPC (Remote Procedure Call) özelliği sayesinde, gerçekleşen işlemlerin sonuçları (başarılı/başarısız durumu) anlık olarak subscriber'lara (abonelere) bildirilmektedir.

### 4. Yapay Zeka (MCP / RAG) ve Dosya Analizi
* Panellerin tamamında Yapay Zeka desteği aktif olarak kurgulanmıştır.
* **Prompt İşleme:** Yüklenen bir `.txt` dosyasındaki yapay zeka prompt komutları sistem tarafından okunup işlenerek sonuçlar kullanıcıya sunulabilmektedir.
* **Word to HTML Dönüşümü:** Belli bir formatta hazırlanmış `.docx` dosyaları YZ tarafından analiz edilip HTML koduna dönüştürülebilmektedir.
* Bu sayede dinamik içerik üretimi ve akıllı belge analizi sağlanmıştır.

---

## ⚙️ Kurulum ve Çalıştırma Adımları

Projenin tüm bağımlılıkları Docker üzerinden yönetilmektedir. Projeyi ayağa kaldırmak için bilgisayarınızda Docker ve Docker Compose yüklü olmalıdır.

Lütfen aşağıdaki adımları sırasıyla terminal (veya komut satırı) üzerinden uygulayınız:

**1. Dockerfile ile Veritabanının Oluşturulması ve SQL Dosyasının Yüklenmesi**
Veritabanı servisini başlatmak ve içerisindeki örnek datalarla (`veritabani_yedek.sql`) birlikte ayağa kaldırmak için:
```bash
docker-compose up -d db

Dockerfile ile Backend Servisinin Oluşturulması ve Ayağa Kaldırılması
Mikroservis mimarisindeki backend uygulamasını ve RabbitMQ servisini başlatmak için:

Bash
docker-compose up -d backend rabbitmq

Dockerfile ile Frontend Servisinin Oluşturulması ve Ayağa Kaldırılması
Kullanıcı arayüzünü barındıran NextJS uygulamasını derlemek ve başlatmak için:

Bash
docker-compose up -d frontend
(Alternatif olarak geliştirici modunda çalıştırmak isterseniz proje dizininde sırasıyla npm install ve npm run dev komutlarını kullanabilirsiniz.)
Projenin URL Adresi ve Test İşlemleri
Tüm konteynerler "Running" (Çalışıyor) durumuna geçtikten sonra, projeye aşağıdaki bağlantıdan erişebilirsiniz:

Uygulama Adresi: http://localhost:3000

Sisteme giriş yaptıktan sonra "Supervisor" paneli üzerinden yetki testlerini yapabilir, dosya yükleme ve YZ analiz modüllerini kullanabilirsiniz.
Önemli Bağlantılar ve Ekler
GitHub Proje Linki: [GITHUB_LINKI.txt dosyasına bakınız]

Veritabanı Yedeği: Proje kök dizininde veritabani_yedek.sql olarak bulunmaktadır.
Veritabanı ve Örnek Kullanıcı Bilgileri (Test İçin)
Veritabanı (PostgreSQL) Erişim Bilgileri:
Kullanıcı Adı: postgres
Şifre: 1234
Veritabanı Adı: odev_veritabani
Sistem Giriş (Login) İçin Örnek Kullanıcılar:
Sistemi test edebilmeniz için örnek hesaplar aşağıda tanımlanmıştır:
Supervisor Girişi: supervisor@test.com / Şifre: 123456
Öğrenci Girişi: ogrenci@test.com / Şifre: 123456
Okul Yetkilisi Girişi: okul@test.com / Şifre: 123456
İşletme Girişi: isletme@test.com / Şifre: 123456
Konteyner Linkleri:
Frontend (Arayüz): http://localhost:3000
Backend API: http://localhost:3006
RabbitMQ Yönetim Paneli: http://localhost:15672
