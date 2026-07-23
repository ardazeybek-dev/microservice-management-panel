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
const port = process.env.PORT || 3006;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';

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
    .then(() => console.log('Connected to PostgreSQL successfully! 🐘'))
    .catch(err => console.error('Connection error:', err));

let channel;
async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertQueue('task_queue');
        console.log('Connected to RabbitMQ successfully! 🐇📬');

        channel.consume('task_queue', async (msg) => {
            if (msg !== null) {
                const incomingData = JSON.parse(msg.content.toString());
                try {
                    await pool.query('INSERT INTO genel_veriler (veri) VALUES ($1)', [incomingData]);
                    if (msg.properties.replyTo) {
                        channel.sendToQueue(
                            msg.properties.replyTo,
                            Buffer.from(JSON.stringify({ result: "PROCESSED AND LOGGED TO DATABASE ✅" })),
                            { correlationId: msg.properties.correlationId }
                        );
                    }
                } catch (err) { console.error("Queue processing error:", err); }
                channel.ack(msg);
            }
        });
    } catch (error) { console.error('RabbitMQ error:', error); }
}
connectRabbitMQ();

app.post('/ai-analyze', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "Please select a .txt file!" });
        const content = fs.readFileSync(req.file.path, 'utf-8');

        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

            const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-pro"];
            let model;
            let activeModelName = "";

            for (let m of models) {
                try {
                    model = genAI.getGenerativeModel({ model: m });
                    activeModelName = m;
                    break;
                } catch (e) { continue; }
            }

            if (!model) {
                return res.json({
                    message: "⚠️ Model not found!",
                    aiAnalysis: "The system could not find an up-to-date model. A library update is required."
                });
            }

            const result = await model.generateContent(["Summarize the following text briefly:\n", content]);

            res.json({
                message: `AI analysis successful! 🤖 (Model used: ${activeModelName})`,
                aiAnalysis: result.response.text()
            });
        } catch (aiError) {
            res.json({
                message: "⚠️ AI API error",
                aiAnalysis: "Details: " + aiError.message
            });
        }
    } catch (err) {
        res.status(500).json({ error: "A server-side error occurred." });
    }
});

app.get('/records', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM genel_veriler ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/rpc-test', async (req, res) => {
    try {
        const q = await channel.assertQueue('', { exclusive: true });
        const correlationId = crypto.randomUUID();
        const message = { operation: "Supervisor Task", detail: "A new permission was assigned to the student panel." };

        channel.sendToQueue('task_queue', Buffer.from(JSON.stringify(message)), {
            correlationId: correlationId,
            replyTo: q.queue
        });

        channel.consume(q.queue, (msg) => {
            if (msg !== null && msg.properties.correlationId === correlationId) {
                const reply = JSON.parse(msg.content.toString());
                res.json({ status: "Perfect", response: reply.result });
                setTimeout(() => channel.deleteQueue(q.queue), 500);
            }
        }, { noAck: true });
    } catch (err) { res.status(500).json({ error: "An RPC error occurred" }); }
});

app.listen(port, () => console.log(`Backend is ready at http://localhost:${port}! 🚀`));
