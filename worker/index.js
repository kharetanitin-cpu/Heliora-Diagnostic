// Heliora Care — Staging Backend
// Appointment submissions remain disabled until security testing is complete.

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra
    }
  });

const sameOrigin = request => {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
};

// Get today's date and current time in India.
function indiaNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`
  };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function minutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function formatTime(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );
}

// Existing patient validation.
// Reserved for the future booking submission API.
function validBody(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;

  if (!/^[\p{L} .'-]{2,100}$/u.test(b.patient_name || "")) {
    return false;
  }

  if (!/^\+?[0-9 ()-]{8,20}$/.test(b.patient_phone || "")) {
    return false;
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.patient_email || "") ||
    b.patient_email.length > 254
  ) {
    return false;
  }

  // Home collection is not available yet.
  if (b.appointment_type !== "Centre visit") {
    return false;
  }

  if (!validDate(b.preferred_date)) {
    return false;
  }

  if (b.preferred_date < indiaNow().date) {
    return false;
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.preferred_time || "")) {
    return false;
  }

  return (
    Array.isArray(b.test_ids) &&
    b.test_ids.length > 0 &&
    b.test_ids.length <= 20 &&
    b.test_ids.every(id => Number.isSafeInteger(id) && id > 0) &&
    new Set(b.test_ids).size === b.test_ids.length
  );
}

async function getBookingSettings(env) {
  return env.DB.prepare(`
    SELECT
      opening_time,
      closing_time,
      slot_duration,
      max_bookings_per_slot,
      timezone
    FROM booking_settings
    WHERE id = 1
  `).first();
}

async function getAvailableSlots(env, date) {
  const settings = await getBookingSettings(env);

  if (!settings) {
    throw new Error("Booking settings not configured");
  }

  const duration = Number(settings.slot_duration);
  const capacity = Number(settings.max_bookings_per_slot);

  const opening = minutes(settings.opening_time);
  const closing = minutes(settings.closing_time);

  if (
    !Number.isInteger(duration) ||
    duration < 5 ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    opening < 0 ||
    closing > 1440 ||
    closing <= opening
  ) {
    throw new Error("Invalid booking settings");
  }

  const { results } = await env.DB.prepare(`
    SELECT
      preferred_time,
      COUNT(*) AS booked
    FROM appointments
    WHERE preferred_date = ?
      AND status NOT IN ('Cancelled', 'Rejected')
      AND appointment_type = 'Centre visit'
    GROUP BY preferred_time
  `).bind(date).all();

  const bookedByTime = new Map(
    results.map(row => [
      row.preferred_time,
      Number(row.booked)
    ])
  );

  const current = indiaNow();

  const slots = [];

  for (
    let start = opening;
    start + duration <= closing;
    start += duration
  ) {
    const time = formatTime(start);
    const endTime = formatTime(start + duration);

    const booked = bookedByTime.get(time) || 0;
    const remaining = Math.max(0, capacity - booked);

    const past =
      date < current.date ||
      (date === current.date && time <= current.time);

    slots.push({
      time,
      end_time: endTime,
      capacity,
      booked,
      remaining,
      available: remaining > 0 && !past
    });
  }

  return {
    date,
    timezone: settings.timezone,
    opening_time: settings.opening_time,
    closing_time: settings.closing_time,
    slot_duration: duration,
    max_bookings_per_slot: capacity,
    slots
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === "/api/health") {
      return json({
        ok: true,
        service: "heliora-care",
        database_bound: !!env.DB,
        bookings_enabled: env.ENABLE_BOOKINGS === "true"
      });
    }

    // Admin API remains disabled until authentication is implemented.
    if (path.startsWith("/api/admin/")) {
      return json({
        error: "Admin API disabled pending authentication and role checks."
      }, 403);
    }

    // Diagnostic test catalogue
    if (path === "/api/tests" && request.method === "GET") {
      if (!env.DB) {
        return json({ error: "Database not configured" }, 503);
      }

      try {
        const { results } = await env.DB.prepare(`
          SELECT
            id,
            test_name,
            category,
            price,
            home_collection
          FROM diagnostic_tests
          WHERE active = 1
          ORDER BY test_name
          LIMIT 300
        `).all();

        return json({ tests: results });

      } catch (error) {
        console.error("Unable to load tests");
        return json({ error: "Unable to load tests" }, 503);
      }
    }

    // NEW: Available appointment time slots
    if (path === "/api/slots") {
      if (request.method !== "GET") {
        return json(
          { error: "Method not allowed" },
          405,
          { allow: "GET" }
        );
      }

      if (!env.DB) {
        return json({ error: "Database not configured" }, 503);
      }

      const date = url.searchParams.get("date");

      if (!validDate(date)) {
        return json({
          error: "Please provide a valid date in YYYY-MM-DD format."
        }, 400);
      }

      try {
        const result = await getAvailableSlots(env, date);
        return json(result);

      } catch (error) {
        console.error("Unable to retrieve booking slots");

        return json({
          error: "Unable to retrieve available appointment times."
        }, 503);
      }
    }

    // Booking submissions remain disabled.
    if (path === "/api/bookings") {
      if (request.method !== "POST") {
        return json(
          { error: "Method not allowed" },
          405,
          { allow: "POST" }
        );
      }

      if (env.ENABLE_BOOKINGS !== "true") {
        return json({
          error: "Bookings are not enabled. This is a staging deployment."
        }, 503);
      }

      if (!sameOrigin(request)) {
        return json({ error: "Origin not permitted" }, 403);
      }

      if (!env.DB) {
        return json({ error: "Database not configured" }, 503);
      }

      if (Number(request.headers.get("content-length") || 0) > 12000) {
        return json({ error: "Request too large" }, 413);
      }

      // Booking writes remain locked until server-side capacity
      // enforcement, spam protection, and notifications are ready.
      return json({
        error: "Booking intake locked until security checks are complete."
      }, 503);
    }

    if (path.startsWith("/api/")) {
      return json({ error: "Not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
