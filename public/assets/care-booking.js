
:root{--blue:#1468ad;--teal:#008f98;--green:#29a36a;--ink:#17334a;--muted:#61758a;--line:#deebef;--bg:#f3f9fb}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}a{color:var(--blue)}.shell{max-width:1170px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:14px 24px;background:#fff;border-bottom:1px solid var(--line)}.logo{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--ink);font-size:19px;font-weight:800}.logo img{width:46px;height:46px;object-fit:contain}.top nav{display:flex;gap:20px;align-items:center}.top nav a{text-decoration:none;font-weight:650}.pill,.btn{display:inline-block;border:0;border-radius:11px;padding:12px 18px;font-weight:700;cursor:pointer;text-decoration:none}.btn{background:linear-gradient(110deg,var(--blue),var(--teal));color:white}.btn.secondary{background:#e9f6f5;color:#006a73}.pill{background:#e6f7ee;color:#157448}.hero{background:linear-gradient(125deg,#e7f4ff,#e6fff2);padding:42px;border-radius:22px;margin:24px 0}.hero h1{font-size:clamp(28px,4vw,42px);line-height:1.12;margin:8px 0}.hero p{color:var(--muted);max-width:700px}.grid{display:grid;grid-template-columns:1.5fr 1fr;gap:24px}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:25px;box-shadow:0 10px 32px #1c6e9b0a;margin-bottom:20px}.card h2,.card h3{margin:0 0 15px}.muted{color:var(--muted)}label{display:block;font-weight:650;margin:14px 0 6px}input,select,textarea{width:100%;border:1px solid #cbdce4;border-radius:10px;padding:12px;font:inherit;background:#fff}input:focus,select:focus,textarea:focus{outline:2px solid #79c7d0}input[type=checkbox]{width:auto}.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.tests{display:grid;grid-template-columns:1fr 1fr;gap:10px}.test{border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;gap:10px;align-items:flex-start;cursor:pointer}.test:hover{background:#f2faf9}.test small{display:block;color:var(--muted)}.notice{padding:14px;border-radius:12px;background:#fff5de;color:#745316;margin:15px 0}.success{background:#e4f8ed;color:#14683e}.hidden{display:none!important}.summary{position:sticky;top:15px}.summary ul{padding-left:20px}.mini{font-size:13px}.dash{display:grid;grid-template-columns:235px 1fr;min-height:100vh}.sidebar{background:#fff;border-right:1px solid var(--line);padding:24px 18px}.sidebar .logo{margin-bottom:34px}.sidebar a{display:block;text-decoration:none;color:var(--ink);padding:12px;border-radius:10px;font-weight:650}.sidebar a.active{background:#e8f5fb;color:var(--blue)}.main{padding:30px;min-width:0}.statgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px}.stat strong{font-size:32px;display:block;color:var(--blue)}.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:760px}th,td{text-align:left;border-bottom:1px solid var(--line);padding:13px}th{background:#f5fafb;color:var(--muted);font-size:13px}.status{border-radius:20px;background:#fff3dc;color:#855d00;padding:5px 10px;font-size:12px;font-weight:800}.status.confirmed{background:#e2f7ec;color:#177144}.status.cancelled{background:#ffe6e6;color:#a02e2e}.status.completed{background:#e4f0ff;color:#225da1}.toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.toolbar input{max-width:280px}.modal{position:fixed;inset:0;background:#122b3f8c;display:flex;align-items:center;justify-content:center;padding:20px;z-index:10}.modal .card{width:min(620px,100%);max-height:90vh;overflow:auto}.demo{font-weight:800;letter-spacing:.05em;color:#a56500;font-size:12px}.foot{text-align:center;color:var(--muted);padding:20px}@media(max-width:800px){.grid,.dash{grid-template-columns:1fr}.sidebar{border:0;padding:14px}.sidebar a{display:inline-block}.main{padding:16px}.statgrid{grid-template-columns:1fr 1fr}.hero{padding:26px}.top{flex-wrap:wrap}.tests{grid-template-columns:1fr}}@media(max-width:480px){.row,.statgrid{grid-template-columns:1fr}.top nav{flex-wrap:wrap}}// ======================================================
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
