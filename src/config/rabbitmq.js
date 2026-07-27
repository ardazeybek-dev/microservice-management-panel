const amqp = require('amqplib');
const { pool } = require('./db');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const TASK_QUEUE = 'task_queue';

let channel = null;

/**
 * Opens the connection and starts consuming task_queue.
 *
 * The consumer persists each message into `records` and, when the message
 * carries a replyTo queue, sends the result back — that is the RPC half.
 */
async function connectRabbitMQ() {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(TASK_QUEUE, { durable: true });

    connection.on('error', (err) => console.error('RabbitMQ connection error:', err.message));
    connection.on('close', () => {
        console.warn('RabbitMQ connection closed.');
        channel = null;
    });

    await channel.consume(TASK_QUEUE, async (msg) => {
        if (!msg) return;

        try {
            const payload = JSON.parse(msg.content.toString());
            const result = await pool.query(
                'INSERT INTO records (data) VALUES ($1) RETURNING id',
                [payload]
            );

            if (msg.properties.replyTo) {
                channel.sendToQueue(
                    msg.properties.replyTo,
                    Buffer.from(JSON.stringify({
                        result: 'PROCESSED AND LOGGED TO DATABASE',
                        recordId: result.rows[0].id,
                    })),
                    { correlationId: msg.properties.correlationId }
                );
            }
            channel.ack(msg);
        } catch (err) {
            console.error('Queue processing error:', err.message);
            // Do not requeue: a malformed message would loop forever.
            channel.nack(msg, false, false);
        }
    });

    console.log('Connected to RabbitMQ successfully.');
    return channel;
}

function getChannel() {
    return channel;
}

module.exports = { connectRabbitMQ, getChannel, TASK_QUEUE };
