require('dotenv').config();

async function listModels() {
    try {
        console.log("🔍 Searching for models available to your API key...");

        const apiKey = process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (data.models) {
            console.log("✅ THE MODELS YOUR API KEY CAN USE:");
            data.models.forEach(m => {
                console.log("👉 " + m.name.replace('models/', ''));
            });
        } else {
            console.log("❌ ERROR! Response from Google:", data);
        }
    } catch (error) {
        console.error("❌ SYSTEM ERROR:", error.message);
    }
}

listModels();
