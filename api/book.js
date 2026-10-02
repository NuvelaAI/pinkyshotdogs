// Sends booking requests from the website to the Pinky's inbox.
// Settings live in Vercel > Project > Settings > Environment Variables:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  (from the email provider)
//   MAIL_TO (optional, defaults to SMTP_USER)
const nodemailer = require("nodemailer");

const FIELDS = {
  name: "Name",
  phone: "Phone",
  email: "Email",
  event_date: "Event date",
  event_time: "Start time",
  event_type: "Event type",
  guests: "Estimated guests",
  location: "Location",
  details: "Details",
};
const REQUIRED = ["name", "phone", "email", "event_date", "event_type", "guests", "location"];

const clean = (v, max = 2000) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);
const oneLine = (v) => clean(v, 200).replace(/\n/g, " ");
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = Object.fromEntries(new URLSearchParams(body)); } catch { body = {}; }
  }

  // Spam trap: real visitors never fill this hidden field.
  if (clean(body._gotcha)) return res.status(200).json({ ok: true });

  const data = {};
  for (const key of Object.keys(FIELDS)) data[key] = key === "details" ? clean(body[key]) : oneLine(body[key]);

  const missing = REQUIRED.filter((k) => !data[k]);
  if (missing.length) return res.status(400).json({ ok: false, error: "Missing fields: " + missing.join(", ") });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return res.status(400).json({ ok: false, error: "Invalid email" });
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_TO } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error("Booking form: SMTP settings are missing in Vercel environment variables.");
    return res.status(500).json({ ok: false, error: "Email is not set up yet" });
  }
  const port = Number(SMTP_PORT) || 587;

  const rows = Object.entries(FIELDS).filter(([k]) => data[k]);
  const text = rows.map(([k, label]) => `${label}: ${data[k]}`).join("\n");
  const html =
    `<h2 style="font-family:sans-serif;color:#c21f55">New event booking request</h2>` +
    `<table style="font-family:sans-serif;font-size:15px;border-collapse:collapse">` +
    rows.map(([k, label]) =>
      `<tr><td style="padding:6px 14px 6px 0;font-weight:bold;vertical-align:top">${label}</td>` +
      `<td style="padding:6px 0;white-space:pre-wrap">${esc(data[k])}</td></tr>`).join("") +
    `</table><p style="font-family:sans-serif;color:#666">Reply to this email to answer ${esc(data.name)} directly.</p>`;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({
      from: `"Pinky's Website" <${SMTP_USER}>`,
      to: MAIL_TO || SMTP_USER,
      replyTo: `"${data.name.replace(/"/g, "")}" <${data.email}>`,
      subject: `Booking request: ${data.event_type} on ${data.event_date}`,
      text,
      html,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Booking form send failed:", err && err.message);
    return res.status(502).json({ ok: false, error: "Could not send" });
  }
};
