/* ==========================================================
   HELIORA CARE — APPOINTMENT BOOKING
   Interactive Calendar | Staging Version
   ========================================================== */

"use strict";

// ----------------------------------------------------------
// ELEMENTS AND STATE
// ----------------------------------------------------------

const el = (id) => document.getElementById(id);

const chosen = new Set();

let catalogue = [];
let availableSlots = [];

let selectedDate = "";
let selectedTime = "";

let displayedMonth;
let displayedYear;

let slotRequestId = 0;

// Keep false until public booking security is complete.
// Never put BOOKING_TEST_SECRET in browser JavaScript.
const PUBLIC_BOOKINGS_ENABLED = false;

let submitting = false;
let pendingSubmissionId = null;
let pendingPayloadSignature = null;

// ----------------------------------------------------------
// DATE AND TIME HELPERS
// ----------------------------------------------------------

function indiaToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function parseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return { year, month, day };
}

function dateKey(year, month, day) {
  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function displayTime(time) {
  const [hour, minute] = time.split(":").map(Number);

  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function readableDate(dateString) {
  const { year, month, day } = parseDate(dateString);

  return new Date(
    Date.UTC(year, month - 1, day)
  ).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

// ----------------------------------------------------------
// LOAD DIAGNOSTIC TESTS
// ----------------------------------------------------------

async function loadTests() {
  const container = el("tests");

  container.textContent = "Loading diagnostic tests...";

  try {
    const response = await fetch("/api/tests", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Unable to load diagnostic tests");
    }

    const data = await response.json();

    if (!Array.isArray(data.tests)) {
      throw new Error("Invalid diagnostic test response");
    }

    catalogue = data.tests;

    renderTests();

  } catch (error) {
    console.error("Heliora tests error:", error);

    container.textContent =
      "Unable to load diagnostic tests. Please refresh the page.";
  }
}

// ----------------------------------------------------------
// RENDER DIAGNOSTIC TESTS
// ----------------------------------------------------------

function renderTests() {
  const container = el("tests");

  const search = el("search").value.trim().toLowerCase();

  const filtered = catalogue.filter((test) =>
    String(test.test_name || "")
      .toLowerCase()
      .includes(search)
  );

  container.replaceChildren();

  if (!filtered.length) {
    const message = document.createElement("p");

    message.textContent = "No matching tests found.";

    container.appendChild(message);

    renderSummary();

    return;
  }

  for (const test of filtered) {
    const id = Number(test.id);

    const label = document.createElement("label");
    label.className = "test";

    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.dataset.testId = String(id);
    checkbox.checked = chosen.has(id);

    const text = document.createElement("span");

    const name = document.createElement("b");
    name.textContent = test.test_name;

    const category = document.createElement("small");

    category.textContent =
      `${test.category || "Diagnostic test"} · Centre visit`;

    text.append(name, category);
    label.append(checkbox, text);

    container.appendChild(label);
  }

  renderSummary();
}

// ----------------------------------------------------------
// BOOKING SUMMARY
// ----------------------------------------------------------

function renderSummary() {
  el("visit").textContent = "Centre visit";

  const selectedTests = catalogue.filter((test) =>
    chosen.has(Number(test.id))
  );

  const container = el("selected");

  container.replaceChildren();

  if (!selectedTests.length) {
    container.textContent = "No tests selected yet.";
    return;
  }

  const list = document.createElement("ul");

  for (const test of selectedTests) {
    const item = document.createElement("li");

    item.textContent = test.test_name;

    list.appendChild(item);
  }

  container.appendChild(list);
}

// ----------------------------------------------------------
// INITIALIZE CALENDAR
// ----------------------------------------------------------

function initializeCalendar() {
  const today = parseDate(indiaToday());

  displayedMonth = today.month;
  displayedYear = today.year;

  renderCalendar();
}

// ----------------------------------------------------------
// RENDER CALENDAR
// ----------------------------------------------------------

function renderCalendar() {
  const container = el("calendar-days");

  container.replaceChildren();

  const monthName = new Date(
    Date.UTC(displayedYear, displayedMonth - 1, 1)
  ).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    month: "long",
    year: "numeric"
  });

  el("calendar-month").textContent = monthName;

  const firstDay = new Date(
    Date.UTC(displayedYear, displayedMonth - 1, 1)
  ).getUTCDay();

  const daysInMonth = new Date(
    Date.UTC(displayedYear, displayedMonth, 0)
  ).getUTCDate();

  const today = indiaToday();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("span");

    empty.className = "calendar-empty";

    container.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = dateKey(
      displayedYear,
      displayedMonth,
      day
    );

    const button = document.createElement("button");

    button.type = "button";
    button.className = "calendar-day";
    button.textContent = String(day);
    button.dataset.date = date;

    if (date < today) {
      button.disabled = true;
      button.classList.add("past");
    }

    if (date === today) {
      button.classList.add("today");
    }

    if (date === selectedDate) {
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
    } else {
      button.setAttribute("aria-pressed", "false");
    }

    button.addEventListener("click", () => {
      selectDate(date);
    });

    container.appendChild(button);
  }

  const todayParts = parseDate(today);

  const currentMonth =
    displayedYear === todayParts.year &&
    displayedMonth === todayParts.month;

  const pastMonth =
    displayedYear < todayParts.year ||
    (
      displayedYear === todayParts.year &&
      displayedMonth < todayParts.month
    );

  el("prev-month").disabled = currentMonth || pastMonth;
}

// ----------------------------------------------------------
// SELECT DATE
// ----------------------------------------------------------

async function selectDate(date) {
  if (date < indiaToday()) {
    return;
  }

  selectedDate = date;
  selectedTime = "";

  el("date").value = date;
  el("time").value = "";

  el("selected-date-label").textContent = readableDate(date);

  el("result").replaceChildren();

  renderCalendar();

  await loadSlots(date);
}

// ----------------------------------------------------------
// LOAD LIVE APPOINTMENT SLOTS
// ----------------------------------------------------------

async function loadSlots(date) {
  const requestId = ++slotRequestId;

  const container = el("time-slots");
  const message = el("slot-message");

  container.replaceChildren();

  availableSlots = [];

  message.textContent = "Checking available appointments...";

  try {
    const response = await fetch(
      `/api/slots?date=${encodeURIComponent(date)}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error("Unable to retrieve slots");
    }

    const data = await response.json();

    if (requestId !== slotRequestId) {
      return false;
    }

    if (!Array.isArray(data.slots)) {
      throw new Error("Invalid appointment slots response");
    }

    availableSlots = data.slots;

    let availableCount = 0;

    for (const slot of availableSlots) {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "time-slot";
      button.dataset.time = slot.time;

      const timeLabel = document.createElement("strong");
      timeLabel.textContent = displayTime(slot.time);

      const capacityLabel = document.createElement("small");

      if (slot.available) {
        capacityLabel.textContent =
          `${slot.remaining} places left`;

        availableCount++;
      } else {
        capacityLabel.textContent = "Unavailable";

        button.disabled = true;
        button.classList.add("full");
      }

      button.append(timeLabel, capacityLabel);

      button.addEventListener("click", () => {
        selectTime(slot.time);
      });

      container.appendChild(button);
    }

    message.textContent = availableCount
      ? `${availableCount} appointment times available.`
      : "No appointment times available for this date.";

    return true;

  } catch (error) {
    if (requestId !== slotRequestId) {
      return false;
    }

    console.error("Heliora slots error:", error);

    message.textContent =
      "Unable to check availability. Please try again.";

    return false;
  }
}

// ----------------------------------------------------------
// SELECT TIME
// ----------------------------------------------------------

function selectTime(time) {
  const slot = availableSlots.find((item) =>
    item.time === time && item.available
  );

  if (!slot) {
    return;
  }

  selectedTime = time;

  el("time").value = time;

  document.querySelectorAll(".time-slot").forEach((button) => {
    const isSelected = button.dataset.time === time;

    button.classList.toggle("selected", isSelected);

    button.setAttribute(
      "aria-pressed",
      isSelected ? "true" : "false"
    );
  });

  el("result").replaceChildren();
}

// ----------------------------------------------------------
// MONTH NAVIGATION
// ----------------------------------------------------------

el("prev-month").addEventListener("click", () => {
  displayedMonth--;

  if (displayedMonth < 1) {
    displayedMonth = 12;
    displayedYear--;
  }

  renderCalendar();
});

el("next-month").addEventListener("click", () => {
  displayedMonth++;

  if (displayedMonth > 12) {
    displayedMonth = 1;
    displayedYear++;
  }

  renderCalendar();
});

// ----------------------------------------------------------
// TEST SELECTION
// ----------------------------------------------------------

el("tests").addEventListener("change", (event) => {
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

  el("result").replaceChildren();
});

el("search").addEventListener("input", renderTests);

// ----------------------------------------------------------
// BOOKING NOTIFICATIONS
// ----------------------------------------------------------

function showBookingNotice(title, message, success = false) {
  const result = el("result");

  result.replaceChildren();

  const notice = document.createElement("div");

  notice.className = success
    ? "notice success"
    : "notice";

  const heading = document.createElement("b");
  heading.textContent = title;

  const details = document.createElement("p");
  details.textContent = message;

  notice.append(heading, details);

  result.appendChild(notice);

  result.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

// ----------------------------------------------------------
// UNIQUE BOOKING SUBMISSION ID
// ----------------------------------------------------------

function newSubmissionId() {
  if (
    globalThis.crypto &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  throw new Error(
    "Secure booking identifiers are unavailable in this browser."
  );
}

// ----------------------------------------------------------
// BOOKING FORM SUBMISSION
// ----------------------------------------------------------

el("booking").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (submitting) {
    return;
  }

  // Validate selected tests.

  if (!chosen.size) {
    showBookingNotice(
      "Test required",
      "Please select at least one diagnostic test."
    );

    return;
  }

  // Validate appointment selection.

  if (!selectedDate || !selectedTime) {
    showBookingNotice(
      "Appointment required",
      "Please select an appointment date and time."
    );

    return;
  }

  if (selectedDate < indiaToday()) {
    showBookingNotice(
      "Invalid date",
      "Please select a future appointment date."
    );

    return;
  }

  // Read patient details.

  const patientName = el("name").value.trim();
  const patientPhone = el("phone").value.trim();
  const patientEmail = el("email").value.trim();

  // Validate patient name.

  if (!patientName || patientName.length > 120) {
    showBookingNotice(
      "Check patient name",
      "Please enter a valid patient name."
    );

    return;
  }

  // Validate mobile number.

  if (!/^[0-9+()\s-]{10,15}$/.test(patientPhone)) {
    showBookingNotice(
      "Check mobile number",
      "Please enter a valid mobile number."
    );

    return;
  }

  // Validate email.

  if (!el("email").checkValidity() || !patientEmail) {
    showBookingNotice(
      "Check email",
      "Please enter a valid email address."
    );

    return;
  }

  const date = selectedDate;
  const time = selectedTime;

  const button = el("submit-booking");

  submitting = true;
  button.disabled = true;

  const originalLabel = button.textContent;

  button.textContent = "Checking availability...";

  try {
    // Recheck availability before continuing.

    const loaded = await loadSlots(date);

    if (!loaded) {
      showBookingNotice(
        "Availability check failed",
        "Please try again after refreshing appointment availability."
      );

      return;
    }

    if (selectedDate !== date || selectedTime !== time) {
      return;
    }

    const slot = availableSlots.find((item) =>
      item.time === time && item.available
    );

    if (!slot) {
      selectedTime = "";
      el("time").value = "";

      showBookingNotice(
        "Time unavailable",
        "This appointment time is no longer available. Please select another."
      );

      return;
    }

    selectTime(time);

    // ------------------------------------------------------
    // SAFE STAGING MODE
    // ------------------------------------------------------

    if (!PUBLIC_BOOKINGS_ENABLED) {
      showBookingNotice(
        "Booking Preview",
        `${readableDate(date)} at ${displayTime(time)} — Centre visit. ` +
        "Demo only: no appointment has been saved, " +
        "no patient details have been sent, " +
        "and no confirmation email has been sent.",
        true
      );

      return;
    }

    // ------------------------------------------------------
    // FUTURE PUBLIC BOOKING SUBMISSION
    // This section remains inactive while demo mode is on.
    // ------------------------------------------------------

    const payload = {
      patient_name: patientName,
      patient_phone: patientPhone,
      patient_email: patientEmail,
      appointment_type: "Centre visit",
      preferred_date: date,
      preferred_time: time,
      test_ids: [...chosen].sort((a, b) => a - b)
    };

    // Reuse the same submission ID for an identical retry.

    const signature = JSON.stringify(payload);

    if (signature !== pendingPayloadSignature) {
      pendingSubmissionId = newSubmissionId();
      pendingPayloadSignature = signature;
    }

    payload.submission_id = pendingSubmissionId;

    button.textContent = "Submitting appointment...";

    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 409) {
        showBookingNotice(
          "Booking not completed",
          data.error ||
          "This request was already submitted or the selected time is full. " +
          "Please contact the centre if you already received a booking reference."
        );

        await loadSlots(date);
      } else {
        showBookingNotice(
          "Unable to submit",
          data.error ||
          "Please try again later. Your booking is not confirmed."
        );
      }

      return;
    }

    if (!data.booking_reference) {
      showBookingNotice(
        "Confirmation pending",
        "The server did not provide a booking reference. " +
        "Please contact the centre before trying again."
      );

      return;
    }

    // Display booking confirmation.

    showBookingNotice(
      "Appointment request received",
      `Reference: ${data.booking_reference}. ` +
      `${readableDate(date)} at ${displayTime(time)}. ` +
      `Status: ${data.status || "Pending"}. ` +
      "A confirmation email has not been verified.",
      true
    );

    pendingSubmissionId = null;
    pendingPayloadSignature = null;

    await loadSlots(date);

  } catch (error) {
    console.error("Heliora booking error:", error);

    showBookingNotice(
      "Unable to complete request",
      "Please check your connection. " +
      "If you already submitted, contact the centre " +
      "before attempting another booking."
    );

  } finally {
    submitting = false;
    button.disabled = false;
    button.textContent = originalLabel;
  }
});

// ----------------------------------------------------------
// START APPLICATION
// ----------------------------------------------------------

el("type").value = "Centre visit";

initializeCalendar();

loadTests();

console.log("Heliora Care booking calendar initialized.");
