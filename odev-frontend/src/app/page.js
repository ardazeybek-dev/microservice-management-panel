"use client";
import { useState, useEffect } from "react";

export default function Home() {
  const [aktifRol, setAktifRol] = useState("Supervisor");
  const [veriler, setVeriler] = useState([]);
  const [dosya, setDosya] = useState(null);
  const [aiSonucu, setAiSonucu] = useState("");

  const [yetkiler, setYetkiler] = useState({
    Ogrenci: { listeGorebilir: true, crudYapabilir: false, dosyaYukleyebilir: false },
    Okul: { listeGorebilir: true, crudYapabilir: true, dosyaYukleyebilir: true },
    Isletme: { listeGorebilir: false, crudYapabilir: false, dosyaYukleyebilir: true },
  });

  const yetkiDegistir = (rol, yetkiTuru) => {
    setYetkiler((prev) => ({
      ...prev,
      [rol]: { ...prev[rol], [yetkiTuru]: !prev[rol][yetkiTuru] },
    }));
  };

  const verileriGetir = async () => {
    try {
      const res = await fetch("http://localhost:3006/listele");
      const data = await res.json();
      setVeriler(data);
    } catch (error) {
      console.error("Veritabanına ulaşılamadı!", error);
    }
  };

  const aiAnaliziYap = async () => {
    if (!dosya) return alert("Önce bir dosya seçmelisin reis!");
    
    setAiSonucu("Yapay Zeka dosyayı okuyor, az bekle... ⏳");
    const formData = new FormData();
    formData.append("belge", dosya);

    try {
      const res = await fetch("http://localhost:3006/ai-analiz", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setAiSonucu(data.yapayZekaAnalizi || "Bir hata oluştu.");
    } catch (error) {
      setAiSonucu("Backend'e ulaşılamadı. Sunucu açık mı?");
    }
  };

  const gorevYolla = async () => {
    try {
      const res = await fetch("http://localhost:3006/rpc-test");
      const data = await res.json();
      alert("Tavşan Görevi Tamamladı!\nCevap: " + data.tavsandanGelenCevap);
      verileriGetir(); 
    } catch (error) {
      alert("Tavşana ulaşılamadı!");
    }
  };

  useEffect(() => {
    verileriGetir();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8 font-sans">
      
      {                    }
      <div className="max-w-6xl mx-auto bg-gray-800 p-6 rounded-xl shadow-lg mb-8 border border-gray-700">
        <h1 className="text-2xl font-bold text-center text-blue-400 mb-6">👑 Sisteme Giriş Yapılan Rolü Seçin</h1>
        <div className="flex flex-wrap justify-center gap-4">
          {["Supervisor", "Ogrenci", "Okul", "Isletme"].map((rol) => (
            <button
              key={rol}
              onClick={() => setAktifRol(rol)}
              className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 ${
                aktifRol === rol
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/50 scale-105"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {rol === "Ogrenci" ? "Öğrenci" : rol === "Isletme" ? "İşletme" : rol} Paneli
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        
        {                   }
        {aktifRol === "Supervisor" && (
          <div className="bg-gray-800 p-8 rounded-xl shadow-lg border border-yellow-600/50">
            <h2 className="text-3xl font-bold text-yellow-500 mb-2">⚙️ Supervisor Kontrol Merkezi</h2>
            <p className="text-gray-400 mb-8">Tüm rollerin ekran özelliklerini ve CRUD işlemlerini buradan atayabilirsiniz.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {["Ogrenci", "Okul", "Isletme"].map((rol) => (
                <div key={rol} className="bg-gray-700 p-6 rounded-lg border border-gray-600">
                  <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-600 pb-2">
                    {rol === "Ogrenci" ? "Öğrenci" : rol === "Isletme" ? "İşletme" : rol} Yetkileri
                  </h3>
                  
                  <div className="flex justify-between items-center mb-4">
                    <span>1. Liste Görüntüleme:</span>
                    <button onClick={() => yetkiDegistir(rol, "listeGorebilir")} className={`px-3 py-1 rounded text-sm font-bold ${yetkiler[rol].listeGorebilir ? "bg-green-500" : "bg-red-500"}`}>
                      {yetkiler[rol].listeGorebilir ? "AÇIK" : "KAPALI"}
                    </button>
                  </div>

                  <div className="flex justify-between items-center mb-4">
                    <span>2. CRUD İşlemleri:</span>
                    <button onClick={() => yetkiDegistir(rol, "crudYapabilir")} className={`px-3 py-1 rounded text-sm font-bold ${yetkiler[rol].crudYapabilir ? "bg-green-500" : "bg-red-500"}`}>
                      {yetkiler[rol].crudYapabilir ? "AÇIK" : "KAPALI"}
                    </button>
                  </div>

                  <div className="flex justify-between items-center">
                    <span>3. Dosya & Yapay Zeka:</span>
                    <button onClick={() => yetkiDegistir(rol, "dosyaYukleyebilir")} className={`px-3 py-1 rounded text-sm font-bold ${yetkiler[rol].dosyaYukleyebilir ? "bg-green-500" : "bg-red-500"}`}>
                      {yetkiler[rol].dosyaYukleyebilir ? "AÇIK" : "KAPALI"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {                    }
        {aktifRol !== "Supervisor" && (
          <div className="bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-700">
            <h2 className="text-3xl font-bold text-blue-400 mb-6">
              👋 Hoş Geldiniz, {aktifRol === "Ogrenci" ? "Öğrenci" : aktifRol === "Isletme" ? "İşletme" : aktifRol}!
            </h2>

            <div className="space-y-6">
              
              {               }
              <div className={`p-6 rounded-lg border ${yetkiler[aktifRol].listeGorebilir ? "bg-gray-700 border-green-500/30" : "bg-red-900/20 border-red-500/30 text-red-400"}`}>
                <h3 className="text-xl font-bold mb-4">📋 Genel Liste Ekranı (PostgreSQL Verileri)</h3>
                {yetkiler[aktifRol].listeGorebilir ? (
                  <div className="bg-gray-900 p-4 rounded h-48 overflow-y-auto font-mono text-sm text-green-400">
                    {veriler.length > 0 ? (
                      veriler.map((v) => (
                        <div key={v.id} className="mb-2 border-b border-gray-700 pb-1">
                          <span className="text-blue-300">ID: {v.id}</span> | Tarih: {new Date(v.kayit_tarihi || v.date).toLocaleString()} | Veri: {JSON.stringify(v.veri || v.value)}
                        </div>
                      ))
                    ) : (
                      <p>Kayıtlı veri bulunamadı.</p>
                    )}
                  </div>
                ) : (
                  <p>❌ Supervisor bu ekranı görmenizi kısıtladı!</p>
                )}
              </div>

              {               }
              <div className={`p-6 rounded-lg border ${yetkiler[aktifRol].crudYapabilir ? "bg-gray-700 border-green-500/30" : "bg-red-900/20 border-red-500/30 text-red-400"}`}>
                <h3 className="text-xl font-bold mb-4">✏️ İşlem (CRUD) ve RabbitMQ Ekranı</h3>
                {yetkiler[aktifRol].crudYapabilir ? (
                  <div className="flex gap-4">
                    <button onClick={gorevYolla} className="bg-green-600 hover:bg-green-500 px-6 py-3 rounded-lg font-bold text-white shadow-lg flex items-center gap-2">
                      🐇 Yeni Veri Ekle (RabbitMQ RPC)
                    </button>
                  </div>
                ) : (
                  <p>❌ Veri ekleme veya RabbitMQ kullanma yetkiniz bulunmamaktadır!</p>
                )}
              </div>

              {                  }
              <div className={`p-6 rounded-lg border ${yetkiler[aktifRol].dosyaYukleyebilir ? "bg-gray-700 border-green-500/30" : "bg-red-900/20 border-red-500/30 text-red-400"}`}>
                <h3 className="text-xl font-bold mb-4">🤖 Dosya Yükleme ve Yapay Zeka Analizi</h3>
                {yetkiler[aktifRol].dosyaYukleyebilir ? (
                  <div className="flex flex-col gap-4">
                    <input 
                      type="file" 
                      onChange={(e) => setDosya(e.target.files[0])}
                      accept=".txt,.png,.pdf,.doc,.docx" 
                      className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500"
                    />
                    <button onClick={aiAnaliziYap} className="bg-purple-600 hover:bg-purple-500 px-6 py-3 rounded-lg font-bold text-white shadow-lg self-start">
                      ✨ Dosyayı Gemini AI'a Gönder
                    </button>
                    {aiSonucu && (
                      <div className="mt-4 p-4 bg-gray-900 rounded font-mono text-sm text-purple-300 whitespace-pre-wrap">
                        {aiSonucu}
                      </div>
                    )}
                  </div>
                ) : (
                  <p>❌ Supervisor dosya yükleme ve yapay zeka özelliğini sizin için kısıtladı!</p>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}