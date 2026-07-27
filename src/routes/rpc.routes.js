const express = require('express');
const crypto = require('crypto');
const { getChannel, TASK_QUEUE } = require('../config/rabbitmq');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

const RPC_TIMEOUT_MS = 10_000;

/**
 * GET /rpc-test — full RabbitMQ request/reply round trip.
 *
 * Publishes to task_queue with an exclusive replyTo queue and a correlationId,
 * then waits for the consumer's answer. If no reply arrives within the timeout
 * the request is failed and the temporary queue torn down — without that, a
 * silent consumer would leave the HTTP request hanging forever.
 */
router.get('/', authenticate, requirePermission('rpc:execute'), async (req, res, next) => {
    const channel = getChannel();

    if (!channel) {
        return res.status(503).json({ error: 'Message broker is not available.' });
    }

    let replyQueue;
    let timer;
    let settled = false;

    const cleanup = async () => {
        clearTimeout(timer);
        if (replyQueue) {
            await channel.deleteQueue(replyQueue).catch(() => {});
        }
    };

    try {
        const { queue } = await channel.assertQueue('', { exclusive: true, autoDelete: true });
        replyQueue = queue;

        const correlationId = crypto.randomUUID();
        const message = {
            operation: 'Supervisor Task',
            detail: 'A new permission was assigned to the student panel.',
            requestedBy: req.user.email,
        };

        timer = setTimeout(async () => {
            if (settled) return;
            settled = true;
            await cleanup();
            res.status(504).json({ error: 'The message broker did not reply in time.' });
        }, RPC_TIMEOUT_MS);

        await channel.consume(
            replyQueue,
            async (msg) => {
                if (settled || !msg || msg.properties.correlationId !== correlationId) return;
                settled = true;

                const reply = JSON.parse(msg.content.toString());
                await cleanup();
                res.json({ status: 'ok', correlationId, response: reply });
            },
            { noAck: true }
        );

        channel.sendToQueue(TASK_QUEUE, Buffer.from(JSON.stringify(message)), {
            correlationId,
            replyTo: replyQueue,
            persistent: true,
        });
    } catch (err) {
        settled = true;
        await cleanup();
        return next(err);
    }
});

module.exports = router;
