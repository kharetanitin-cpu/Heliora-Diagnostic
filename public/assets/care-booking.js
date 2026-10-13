let catalogue = [];

const chosen = new Set();
const el = id => document.getElementById(id);

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

async function loadCatalogue() {
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
      throw new Error("Invalid catalogue response");
    }

    catalogue = data.tests.map(test => ({
      id: test.id,
      name: test.test_name,
      category: test.category || "Diagnostic Test",
      price: test.price,
      home: Number(test.home_collection) === 1
    }));

    render();

  } catch (error) {
    console.error("Catalogue loading failed:", error);

    el("tests").textContent =
      "Unable to load diagnostic tests. Please refresh the page.";
  }
}

function render() {
  const search = el("search").value.toLowerCase();

  const filtered = catalogue.filter(test =>
    test.name.toLowerCase().includes(search)
  );

  el("tests").innerHTML = filtered.map(test => {

    const checked = chosen.has(test.id) ? "checked" : "";

    const availability = test.home
      ? "Home collection eligible"
      : "Centre visit only";

    return `
      <label class="test">
        <input
          type="checkbox"
          data-test-id="${test.id}"
          ${checked}
        >
        <span>
          <b>${escapeHTML(test.name)}</b>
          <small>
            ${escapeHTML(test.category)} · ${availability}
          </small>
        </span>
      </label>
    `;

  }).join("") || "<p>No matching tests.</p>";

  const selectedTests = catalogue.filter(test =>
    chosen.has(test.id)
  );

  el("selected").innerHTML = selectedTests.length
    ? "<ul>" +
      selectedTests.map(test =>
        `<li>${escapeHTML(test.name)}</li>`
      ).join("") +
      "</ul>"
    : "No tests selected yet.";

  el("visit").textContent = el("type").value;
}

el("tests").addEventListener("change", event => {

  const checkbox = event.target;

  if (!checkbox.matches("[data-test-id]")) {
    return;
  }

  const id = Number(checkbox.dataset.testId);

  if (checkbox.checked) {
    chosen.add(id);
  } else {
    chosen.delete(id);
  }

  render();
});

el("search").addEventListener("input", render);

el("type").addEventListener("change", () => {

  const isHome =
    el("type").value === "Home sample collection";

  el("addressblock").classList.toggle("hidden", !isHome);

  render();
});

el("date").min = new Date(
  Date.now() - new Date().getTimezoneOffset() * 60000
).toISOString().slice(0, 10);

el("booking").addEventListener("submit", event => {

  event.preventDefault();

  if (!chosen.size) {
    alert("Please select at least one test.");
    return;
  }

  const selectedTests = catalogue.filter(test =>
    chosen.has(test.id)
  );

  const isHome =
    el("type").value === "Home sample collection";

  if (isHome && selectedTests.some(test => !test.home)) {
    alert(
      "Some selected tests are available for centre visits only."
    );
    return;
  }

  if (isHome && !el("address").value.trim()) {
    alert("Please enter a collection address.");
    return;
  }

  const reference =
    "DEMO-" + Math.floor(100000 + Math.random() * 900000);

  el("result").innerHTML = `
    <div class="notice success">
      <b>Preview created: ${reference}</b>
      <br>
      This is not a confirmed appointment.
      No email has been sent and no booking has been
      saved to the database.
    </div>
  `;

  el("result").scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
});

loadCatalogue();
