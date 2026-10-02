// Sends booking requests from the website to the Pinky's inbox.
// Settings live in Vercel > Project > Settings > Environment Variables:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  (from the email provider)
//   MAIL_TO (optional, defaults to SMTP_USER)
//   SMTP_TLS_SERVERNAME (optional, name to check the server's certificate against)
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
  // Network Solutions / Domain.com mail servers use a *.hostingplatform.com certificate,
  // so check the certificate against that name instead of the netsolmail.net alias.
  const tlsName =
    process.env.SMTP_TLS_SERVERNAME ||
    (/\.(netsolmail\.net|oxcs\.net)\.?$/i.test(SMTP_HOST) ? "smtp.hostingplatform.com" : undefined);

  const rows = Object.entries(FIELDS).filter(([k]) => data[k]);
  const text = rows.map(([k, label]) => `${label}: ${data[k]}`).join("\n");
  const html =
    `<h2 style="font-family:sans-serif;color:#c21f55">New event booking request</h2>` +
    `<table style="font-family:sans-serif;font-size:15px;border-collapse:collapse">` +
    rows.map(([k, label]) =>
      `<tr><td style="padding:6px 14px 6px 0;font-weight:bold;vertical-align:top">${label}</td>` +
      `<td style="padding:6px 0;white-space:pre-wrap">${esc(data[k])}</td></tr>`).join("") +
    `</table><p style="font-family:sans-serif;color:#666">Reply to this email to answer ${esc(data.name)} directly.</p>`;

  const user = SMTP_USER.trim();
  const pass = SMTP_PASS.replace(/^\s+|\s+$/g, "");
  const makeTransport = (authMethod) =>
    nodemailer.createTransport({
      host: SMTP_HOST.trim(),
      port,
      secure: port === 465,
      auth: { user, pass },
      ...(authMethod ? { authMethod } : {}),
      ...(tlsName ? { tls: { servername: tlsName } } : {}),
    });
  const mail = {
      from: `"Pinky's Website" <${user}>`,
      to: MAIL_TO || user,
      replyTo: `"${data.name.replace(/"/g, "")}" <${data.email}>`,
      subject: `Booking request: ${data.event_type} on ${data.event_date}`,
      text,
      html,
  };

  try {
    try {
      await makeTransport().sendMail(mail);
    } catch (err) {
      // Some mail servers only accept the older LOGIN sign-in method.
      if (err && err.responseCode === 535) await makeTransport("LOGIN").sendMail(mail);
      else throw err;
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    // Safe diagnostics only: never log the password itself.
    console.error(
      "Booking form send failed:", err && err.message,
      `| host=${SMTP_HOST.trim()} port=${port} user=${user}` +
      ` passLength=${pass.length} passHadExtraSpaces=${pass.length !== SMTP_PASS.length}`
    );
    return res.status(502).json({ ok: false, error: "Could not send" });
  }
};
