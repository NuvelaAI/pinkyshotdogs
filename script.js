// ===== SETTINGS =====
// Paste the Formspree endpoint here once the form is created (e.g. "https://formspree.io/f/abcdwxyz").
// Until then, the form opens the visitor's email app with the details filled in.
const FORM_ENDPOINT = "https://formspree.io/f/xbglppnz";
const BOOKING_EMAIL = "book@pinkysdogs.com";
// ====================

document.getElementById("year").textContent = new Date().getFullYear();

// Mobile menu
const toggle = document.querySelector(".nav-toggle");
const links = document.getElementById("nav-links");
toggle.addEventListener("click", () => {
  const open = links.classList.toggle("open");
  toggle.setAttribute("aria-expanded", open);
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});
links.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    links.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
  })
);

// No past dates in the event date picker
const dateInput = document.querySelector('input[name="event_date"]');
const today = new Date();
today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
dateInput.min = today.toISOString().split("T")[0];

// Booking form
const form = document.getElementById("book-form");
const status = document.getElementById("form-status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.className = "form-status";
  status.textContent = "";

  let firstBad = null;
  form.querySelectorAll("[required]").forEach((el) => {
    const bad = !el.checkValidity();
    el.classList.toggle("invalid", bad);
    if (bad && !firstBad) firstBad = el;
  });
  if (firstBad) {
    status.classList.add("err");
    status.textContent = "Please fill in the highlighted fields.";
    firstBad.focus();
    return;
  }

  const data = new FormData(form);
  if (data.get("_gotcha")) return; // spam bot

  if (!FORM_ENDPOINT) {
    const lines = [
      `Name: ${data.get("name")}`,
      `Phone: ${data.get("phone")}`,
      `Email: ${data.get("email")}`,
      `Event date: ${data.get("event_date")} ${data.get("event_time") || ""}`,
      `Event type: ${data.get("event_type")}`,
      `Estimated guests: ${data.get("guests")}`,
      `Location: ${data.get("location")}`,
      "",
      `${data.get("details") || ""}`,
    ];
    const subject = `Event booking request: ${data.get("event_type")} on ${data.get("event_date")}`;
    window.location.href = `mailto:${BOOKING_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
    status.classList.add("ok");
    status.textContent = "Opening your email app to send the request...";
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = "Sending...";
  try {
    const res = await fetch(FORM_ENDPOINT, {
      method: "POST",
      body: data,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error();
    form.reset();
    showThanks();
  } catch {
    status.classList.add("err");
    status.textContent = `Something went wrong. Please call, text, or email ${BOOKING_EMAIL}.`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Send Booking Request";
  }
});

form.querySelectorAll("input, select, textarea").forEach((el) =>
  el.addEventListener("input", () => el.classList.remove("invalid"))
);

// Thank-you popup
const thanks = document.getElementById("thanks-dialog");
function showThanks() {
  if (typeof thanks.showModal === "function") {
    thanks.showModal();
    document.getElementById("thanks-close").focus();
  } else {
    status.classList.add("ok");
    status.textContent = "Thanks! We got your request and will be in touch soon.";
  }
}
document.getElementById("thanks-close").addEventListener("click", () => thanks.close());
thanks.addEventListener("click", (e) => { if (e.target === thanks) thanks.close(); });
