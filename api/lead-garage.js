export default async function handler(req, res) {
if (req.method !== "POST") {
return res.status(405).json({ ok: false, error: "Method not allowed" });
}

try {
const { name = "", email = "", garage = "", message = "" } = req.body || {};

const webhookUrl = process.env.MAKE_WEBHOOK_URL;
if (!webhookUrl) {
return res.status(500).json({ ok: false, error: "Missing webhook URL" });
}

const payload = { name, email, garage, message };

const response = await fetch(webhookUrl, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(payload),
});

if (!response.ok) {
return res.status(502).json({ ok: false, error: "Webhook failed" });
}

return res.status(200).json({ ok: true, message: "Lead sent" });
} catch (error) {
return res.status(500).json({ ok: false, error: "Server error" });
}
}

