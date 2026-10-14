// ======================================================
// HELIORA CARE - INTERACTIVE APPOINTMENT BOOKING
// Staging Version
// ======================================================

const el = id => document.getElementById(id);

const chosen = new Set();

let catalogue = [];
let availableSlots = [];
let selectedDate = "";
let selectedTime = "";

let displayedMonth;
let displayedYear;

let slotRequestId = 0;

// ======================================================
// DATE HELPERS
// ======================================================

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

  return new Date(Date.UTC(year, month - 1, day))
    .toLocaleDateString("en-IN", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
}

// ======================================================
// SAFE HTML
// ======================================================

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

// ======================================================
// LOAD DIAGNOSTIC TESTS
// ======================================================

async function loadTests() {
  el("tests").textContent = "Loading diagnostic tests...";

  try {
    const response = await fetch("/api/tests", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Unable to load tests");
    }

    const data = await response.json();

    if (!Array.isArray(data.tests)) {
      throw new Error("Invalid test catalogue");
    }

    catalogue = data.tests;

    renderTests();

  } catch (error) {
    el("tests").textContent =
      "Unable to load diagnostic tests. Please refresh the page.";
  }
}

// ======================================================
// DISPLAY DIAGNOSTIC TESTS
// ======================================================

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
            data-test-id="${Number(test.id)}"
            ${chosen.has(Number(test.id)) ? "checked" : ""}
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

function renderSummary() {
  el("visit").textContent = "Centre visit";

  const selected = catalogue.filter(test =>
    chosen.has(Number(test.id))
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

// ======================================================
// CALENDAR
// ======================================================

function initializeCalendar() {
  const today = parseDate(indiaToday());

  displayedMonth = today.month;
  displayedYear = today.year;

  renderCalendar();
}

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

  // Empty spaces before first day
  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement("span");
    blank.className = "calendar-empty";
    container.appendChild(blank);
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

    button.textContent = day;
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
    }

    button.addEventListener("click", () => {
      selectDate(date);
    });

    container.appendChild(button);
  }

  const todayParts = parseDate(today);

  const isCurrentMonth =
    displayedYear === todayParts.year &&
    displayedMonth === todayParts.month;

  const isPastMonth =
    displayedYear < todayParts.year ||
    (
      displayedYear === todayParts.year &&
      displayedMonth < todayParts.month
    );

  el("prev-month").disabled =
    isCurrentMonth || isPastMonth;
}

// ======================================================
// SELECT APPOINTMENT DATE
// ======================================================

async function selectDate(date) {
  selectedDate = date;
  selectedTime = "";

  el("date").value = date;
  el("time").value = "";

  el("selected-date-label").textContent =
    readableDate(date);

  el("result").replaceChildren();

  renderCalendar();

  await loadSlots(date);
}

// ======================================================
// LOAD LIVE APPOINTMENT SLOTS
// ======================================================

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
      throw new Error("Unable to load slots");
    }

    const data = await response.json();

    if (requestId !== slotRequestId) {
      return;
    }

    if (!Array.isArray(data.slots)) {
      throw new Error("Invalid slots response");
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
        capacityLabel.textContent = "Fully booked";
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

  } catch (error) {
    if (requestId !== slotRequestId) {
      return;
    }

    message.textContent =
      "Unable to check availability. Please try again.";
  }
}

// ======================================================
// SELECT APPOINTMENT TIME
// ======================================================

function selectTime(time) {
  const slot = availableSlots.find(item =>
    item.time === time && item.available
  );

  if (!slot) {
    return;
  }

  selectedTime = time;

  el("time").value = time;

  document.querySelectorAll(".time-slot")
    .forEach(button => {
      button.classList.toggle(
        "selected",
        button.dataset.time === time
      );
    });

  el("result").replaceChildren();
}

// ======================================================
// MONTH NAVIGATION
// ======================================================

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

// ======================================================
// TEST SELECTION
// ======================================================

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

el("search").addEventListener("input", renderTests);

// ======================================================
// DEMO BOOKING PREVIEW
// ======================================================

el("booking").addEventListener("submit", async event => {
  event.preventDefault();

  if (!chosen.size) {
    alert("Please select at least one diagnostic test.");
    return;
  }

  if (!selectedDate || !selectedTime) {
    alert("Please select an appointment date and time.");
    return;
  }

  const date = selectedDate;
  const time = selectedTime;

  // Recheck availability before displaying preview
  await loadSlots(date);

  const slot = availableSlots.find(item =>
    item.time === time && item.available
  );

  if (!slot) {
    selectedTime = "";
    el("time").value = "";

    alert(
      "This appointment time is no longer available. Please select another."
    );

    return;
  }

  // Restore selected time
  selectTime(time);

  const result = el("result");

  result.replaceChildren();

  const notice = document.createElement("div");
  notice.className = "notice success";

  const heading = document.createElement("b");
  heading.textContent = "Booking Preview";

  const details = document.createElement("p");
  details.textContent =
    `${readableDate(date)} at ${displayTime(time)}`;

  const warning = document.createElement("p");
  warning.textContent =
    "This is a demonstration only. No appointment has been saved and no confirmation email has been sent.";

  notice.append(heading, details, warning);

  result.appendChild(notice);

  result.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
});

// ======================================================
// INITIALIZE
// ======================================================

el("type").value = "Centre visit";

initializeCalendar();
loadTests();
