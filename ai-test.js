require('dotenv').config();

async function modelleriGetir() {
    try {
        console.log("🔍 API Anahtarına tanımlı modeller aranıyor...");
        
        const apiKey = process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        
        if(data.models) {
             console.log("✅ SENİN ANAHTARININ KULLANABİLECEĞİ MODELLER ŞUNLAR REİS:");
             data.models.forEach(m => {
                 console.log("👉 " + m.name.replace('models/', ''));
             });
        } else {
             console.log("❌ HATA! Google'dan gelen cevap:", data);
        }
    } catch (error) {
        console.error("❌ SİSTEM HATASI:", error.message);
    }
}

modelleriGetir();