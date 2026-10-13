// HELIORA CARE — BOOKING PAGE
// Staging version: displays live tests and slots.
// Actual booking submissions remain disabled.

const el = id => document.getElementById(id);

let catalogue = [];
const chosen = new Set();

let availableSlots = [];
let slotsRequestId = 0;

// Convert 24-hour time to 12-hour display.
function displayTime(time) {
  const [hour, minute] = time.split(":").map(Number);

  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

// Get today's date in India.
function indiaToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

// Safely display text in HTML.
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

// Load diagnostic tests from Cloudflare D1.
async function loadTests() {
  el("tests").textContent = "Loading diagnostic tests...";

  try {
    const response = await fetch("/api/tests", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Unable to retrieve tests");
    }

    const data = await response.json();

    if (!Array.isArray(data.tests)) {
      throw new Error("Invalid test catalogue");
    }

    catalogue = data.tests;
    renderTests();

  } catch (error) {
    el("tests").textContent =
      "Unable to load diagnostic tests. Please try again later.";
  }
}

// Display tests with checkboxes.
function renderTests() {
  const search = el("search").value.trim().toLowerCase();

  const filtered = catalogue.filter(test =>
    test.test_name.toLowerCase().includes(search)
  );

  el("tests").innerHTML = filtered.length
    ? filtered.map(test => `
        <label class="test">
          <input
            type="checkbox"
            data-test-id="${test.id}"
            ${chosen.has(test.id) ? "checked" : ""}
          >

          <span>
            <b>${escapeHTML(test.test_name)}</b>

            <small>
              ${escapeHTML(test.category || "Diagnostic test")}
              · Centre visit
            </small>
          </span>
        </label>
      `).join("")
    : "<p>No matching tests found.</p>";

  renderSummary();
}

// Update booking summary.
function renderSummary() {
  el("visit").textContent = "Centre visit";

  const selected = catalogue.filter(test =>
    chosen.has(test.id)
  );

  if (!selected.length) {
    el("selected").textContent = "No tests selected yet.";
    return;
  }

  const list = document.createElement("ul");

  for (const test of selected) {
    const item = document.createElement("li");
    item.textContent = test.test_name;
    list.appendChild(item);
  }

  el("selected").replaceChildren(list);
}

// Retrieve live appointment availability.
async function loadSlots() {
  const date = el("date").value;
  const timeSelect = el("time");
  const message = el("slot-message");

  // Prevent an older request from replacing newer results.
  const requestId = ++slotsRequestId;

  availableSlots = [];

  timeSelect.disabled = true;
  timeSelect.replaceChildren(new Option("Choose a time", ""));

  if (!date) {
    message.textContent = "Choose a date to check availability.";
    return;
  }

  if (date < indiaToday()) {
    message.textContent = "Please choose today or a future date.";
    return;
  }

  message.textContent = "Checking appointment availability...";

  try {
    const response = await fetch(
      `/api/slots?date=${encodeURIComponent(date)}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error("Unable to retrieve slots");
    }

    const data = await response.json();

    if (requestId !== slotsRequestId) {
      return;
    }

    if (!Array.isArray(data.slots)) {
      throw new Error("Invalid availability response");
    }

    availableSlots = data.slots;

    let availableCount = 0;

    for (const slot of availableSlots) {
      const option = document.createElement("option");

      option.value = slot.time;

      if (slot.available) {
        option.textContent =
          `${displayTime(slot.time)} — ${slot.remaining} available`;

        availableCount++;
      } else {
        option.textContent =
          `${displayTime(slot.time)} — Unavailable`;

        option.disabled = true;
      }

      timeSelect.appendChild(option);
    }

    timeSelect.disabled = availableCount === 0;

    message.textContent = availableCount
      ? `${availableCount} appointment times available. Maximum 5 bookings per slot.`
      : "No appointment times are available for this date.";

  } catch (error) {
    if (requestId !== slotsRequestId) {
      return;
    }

    timeSelect.disabled = true;

    message.textContent =
      "Unable to check availability. Please try again.";
  }
}

// Select or deselect diagnostic tests.
el("tests").addEventListener("change", event => {
  const checkbox = event.target;

  if (!checkbox.matches("input[data-test-id]")) {
    return;
  }

  const id = Number(checkbox.dataset.testId);

  if (checkbox.checked) {
    chosen.add(id);
  } else {
    chosen.delete(id);
  }

  renderTests();
});

// Search diagnostic tests.
el("search").addEventListener("input", renderTests);

// Reload slots when the patient changes the date.
el("date").addEventListener("change", loadSlots);

// Keep the appointment type set to centre visit.
el("type").value = "Centre visit";

// Set the earliest selectable date.
el("date").min = indiaToday();

// Handle demo booking preview.
el("booking").addEventListener("submit", async event => {
  event.preventDefault();

  const result = el("result");
  result.replaceChildren();

  if (!chosen.size) {
    alert("Please select at least one diagnostic test.");
    return;
  }

  const date = el("date").value;
  const time = el("time").value;

  if (!date || !time) {
    alert("Please select an appointment date and time.");
    return;
  }

  // Refresh availability before showing the preview.
  await loadSlots();

  const slot = availableSlots.find(item =>
    item.time === time && item.available
  );

  if (!slot) {
    alert(
      "This appointment time is no longer available. Please select another time."
    );
    return;
  }

  // Restore the selected time after refreshing.
  el("time").value = time;

  const notice = document.createElement("div");
  notice.className = "notice success";

  const heading = document.createElement("b");
  heading.textContent = "Booking Preview";

  const details = document.createElement("p");
  details.textContent =
    `${date} at ${displayTime(time)} — Centre visit`;

  const warning = document.createElement("p");
  warning.textContent =
    "This is a demonstration only. No appointment has been created, no information has been saved, and no confirmation email has been sent.";

  notice.append(heading, details, warning);

  result.appendChild(notice);

  result.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
});

// Initialize booking page.
loadTests();
