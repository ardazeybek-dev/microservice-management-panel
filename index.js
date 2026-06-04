require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const amqp = require('amqplib');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 3006;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.connect()
    .then(() => console.log('PostgreSQL Veritabanına Başarıyla Bağlandık! 🐘'))
    .catch(err => console.error('Bağlantı Hatası:', err));

let channel;
async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        channel = await connection.createChannel();
        await channel.assertQueue('gorev_kuyrugu');
        console.log('RabbitMQ Postanesine Başarıyla Bağlandık! 🐇📬');

        channel.consume('gorev_kuyrugu', async (msg) => {
            if (msg !== null) {
                const gelenVeri = JSON.parse(msg.content.toString());
                try {
                    await pool.query('INSERT INTO genel_veriler (veri) VALUES ($1)', [gelenVeri]);
                    if (msg.properties.replyTo) {
                        channel.sendToQueue(
                            msg.properties.replyTo,
                            Buffer.from(JSON.stringify({ sonuc: "İŞLENDİ VE VERİTABANINA LOGLANDI ✅" })),
                            { correlationId: msg.properties.correlationId }
                        );
                    }
                } catch (err) { console.error("Kuyruk İşleme Hatası:", err); }
                channel.ack(msg);
            }
        });
    } catch (error) { console.error('RabbitMQ Hatası:', error); }
}
connectRabbitMQ();

app.post('/ai-analiz', upload.single('belge'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ hata: "Lütfen bir txt dosyası seçin!" });
        const icerik = fs.readFileSync(req.file.path, 'utf-8');

        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            
            const modeller = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-pro"];
            let model;
            let calisanModelAdi = "";

            for (let m of modeller) {
                try {
                    model = genAI.getGenerativeModel({ model: m });
                    calisanModelAdi = m;
                    break;
                } catch (e) { continue; }
            }

            if (!model) {
                return res.json({ 
                    mesaj: "⚠️ Model Bulunamadı!", 
                    yapayZekaAnalizi: "Sistem güncel bir model bulamadı reis. Kütüphane güncellemesi şart."
                });
            }

            const result = await model.generateContent(["Şu metni kısaca özetle:\n", icerik]);
            
            res.json({ 
                mesaj: `AI Analizi Başarılı! 🤖 (Kullanılan Model: ${calisanModelAdi})`, 
                yapayZekaAnalizi: result.response.text() 
            });
        } catch (aiHata) {
            res.json({
                mesaj: "⚠️ Yapay Zeka API Hatası",
                yapayZekaAnalizi: "Detay: " + aiHata.message
            });
        }
    } catch (err) {
        res.status(500).json({ hata: "Sunucu tarafında bir hata oluştu." });
    }
});

app.get('/listele', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM genel_veriler ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

app.get('/rpc-test', async (req, res) => {
    try {
        const q = await channel.assertQueue('', { exclusive: true });
        const correlationId = crypto.randomUUID();
        const mesaj = { islem: "Supervisor Görevi", detay: "Öğrenci paneline yeni yetki atandı." };

        channel.sendToQueue('gorev_kuyrugu', Buffer.from(JSON.stringify(mesaj)), {
            correlationId: correlationId,
            replyTo: q.queue
        });

        channel.consume(q.queue, (msg) => {
            if (msg !== null && msg.properties.correlationId === correlationId) {
                const cevap = JSON.parse(msg.content.toString());
                res.json({ durum: "Mükemmel", tavsandanGelenCevap: cevap.sonuc });
                setTimeout(() => channel.deleteQueue(q.queue), 500); 
            }
        }, { noAck: true });
    } catch (err) { res.status(500).json({ hata: "RPC Hatası oluştu" }); }
});

app.listen(port, () => console.log(`Backend http://localhost:${port} adresinde fırtına gibi hazır! 🚀`));