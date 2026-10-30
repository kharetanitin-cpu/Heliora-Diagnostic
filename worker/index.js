// ============================================================
// HELIORA CARE — STAGING BACKEND
// Cloudflare Workers + Cloudflare D1
// ============================================================
//
// Production website must remain unchanged.
//
// Required bindings:
// DB                  Cloudflare D1
// ASSETS              Static assets
// ENABLE_BOOKINGS     "false"
// BOOKING_TEST_SECRET Cloudflare encrypted secret
//
// ============================================================

// ============================================================
// CLOUDFLARE ACCESS — JWT AUTHENTICATION
// ============================================================

async function verifyAdminJWT(request, env) {
  try {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return null;

    const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
    const audience = env.CF_ACCESS_AUD;
    if (!teamDomain || !audience) {
      console.error("Cloudflare Access configuration missing");
      return null;
    }

    const issuer = `https://${teamDomain}`;
    const JWKS = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, JWKS, {
      issuer,
      audience,
      algorithms: ["RS256"]
    });

    if (typeof payload.email !== "string" || !payload.email) return null;
    return { email: payload.email.toLowerCase() };
  } catch (error) {
    console.error("Admin JWT verification failed:", error.message);
    return null;
  }
}

// ============================================================
// HELIORA CARE — STAFF AUTHORIZATION
// ============================================================

async function verifyAdminAccess(request, env) {
  try {
    const identity = await verifyAdminJWT(request, env);
    if (!identity || !env.DB) return null;

    const staff = await env.DB.prepare(`
      SELECT id, email, role, active
      FROM staff_users
      WHERE lower(email) = ?
      LIMIT 1
    `).bind(identity.email).first();

    if (!staff || Number(staff.active) !== 1) return null;
    if (!["super_admin", "staff"].includes(staff.role)) return null;

    return { id: staff.id, email: staff.email, role: staff.role };
  } catch (error) {
    console.error("Staff authorization failed:", error.message);
    return null;
  }
}
// ------------------------------------------------------------
// RESPONSE HELPERS
// ------------------------------------------------------------
import { jwtVerify, createRemoteJWKSet } from "jose";
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra
    }
  });
}


// ------------------------------------------------------------
// INDIA DATE AND TIME
// ------------------------------------------------------------

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
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
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


function formatTime(value) {
  return (
    String(Math.floor(value / 60)).padStart(2, "0") +
    ":" +
    String(value % 60).padStart(2, "0")
  );
}


// ------------------------------------------------------------
// BOOKING SETTINGS
// ------------------------------------------------------------

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


function checkSettings(settings) {
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
    capacity > 5 ||
    opening < 0 ||
    closing > 1440 ||
    closing <= opening
  ) {
    throw new Error("Invalid booking settings");
  }

  return {
    duration,
    capacity,
    opening,
    closing
  };
}


// ------------------------------------------------------------
// AVAILABLE APPOINTMENT SLOTS
// ------------------------------------------------------------

async function getAvailableSlots(env, date) {
  const settings = await getBookingSettings(env);

  const {
    duration,
    capacity,
    opening,
    closing
  } = checkSettings(settings);

  const { results } = await env.DB.prepare(`
    SELECT
      appointment_time,
      booked_count
    FROM appointment_slot_capacity
    WHERE appointment_date = ?
  `).bind(date).all();

  const bookedByTime = new Map(
    results.map(row => [
      row.appointment_time,
      Number(row.booked_count)
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
      (
        date === current.date &&
        time <= current.time
      );

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


// ------------------------------------------------------------
// PATIENT VALIDATION
// ------------------------------------------------------------

function validBody(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return false;
  }

  if (
    typeof body.patient_name !== "string" ||
    !/^[\p{L} .'-]{2,100}$/u.test(body.patient_name)
  ) {
    return false;
  }

  if (
    typeof body.patient_phone !== "string" ||
    !/^\+?[0-9 ()-]{8,20}$/.test(body.patient_phone)
  ) {
    return false;
  }

  if (
    typeof body.patient_email !== "string" ||
    body.patient_email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.patient_email)
  ) {
    return false;
  }

  // Home collection is not available yet.

  if (body.appointment_type !== "Centre visit") {
    return false;
  }

  if (!validDate(body.preferred_date)) {
    return false;
  }

  if (
    typeof body.preferred_time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.preferred_time)
  ) {
    return false;
  }

  if (
    !Array.isArray(body.test_ids) ||
    body.test_ids.length < 1 ||
    body.test_ids.length > 20
  ) {
    return false;
  }

  if (
    !body.test_ids.every(
      id => Number.isSafeInteger(id) && id > 0
    )
  ) {
    return false;
  }

  if (
    new Set(body.test_ids).size !== body.test_ids.length
  ) {
    return false;
  }

  if (
    typeof body.submission_id !== "string" ||
    !/^[a-zA-Z0-9_-]{16,100}$/.test(body.submission_id)
  ) {
    return false;
  }

  return true;
}


// ------------------------------------------------------------
// VALIDATE SELECTED TESTS
// ------------------------------------------------------------

async function validateSelectedTests(env, testIds) {
  const placeholders = testIds.map(() => "?").join(",");

  const { results } = await env.DB.prepare(`
    SELECT id
    FROM diagnostic_tests
    WHERE active = 1
      AND id IN (${placeholders})
  `).bind(...testIds).all();

  return results.length === testIds.length;
}


// ------------------------------------------------------------
// VALIDATE SELECTED APPOINTMENT SLOT
// ------------------------------------------------------------

async function verifyAppointmentSlot(env, date, time) {
  const current = indiaNow();

  if (
    date < current.date ||
    (
      date === current.date &&
      time <= current.time
    )
  ) {
    return false;
  }

  const settings = await getBookingSettings(env);

  const {
    duration,
    opening,
    closing
  } = checkSettings(settings);

  const selected = minutes(time);

  return (
    selected >= opening &&
    selected + duration <= closing &&
    (selected - opening) % duration === 0
  );
}


// ------------------------------------------------------------
// BOOKING REFERENCE
// ------------------------------------------------------------

function generateBookingReference() {
  const date = indiaNow().date.replace(/-/g, "");

  const random = crypto.randomUUID()
    .replace(/-/g, "")
    .slice(0, 12)
    .toUpperCase();

  return `HLC-${date}-${random}`;
}

// ============================================================
// CLOUDFLARE TURNSTILE — SERVER-SIDE VERIFICATION
// ============================================================

async function verifyTurnstile(token, request, env) {

  // Check that the Turnstile secret is configured.
  if (
    typeof env.TURNSTILE_SECRET_KEY !== "string" ||
    !env.TURNSTILE_SECRET_KEY
  ) {
    console.error("Turnstile secret is not configured");
    return false;
  }

  // Reject missing or invalid tokens.
  if (
    typeof token !== "string" ||
    token.length < 1 ||
    token.length > 2048
  ) {
    return false;
  }

  try {
    const formData = new FormData();

    formData.append(
      "secret",
      env.TURNSTILE_SECRET_KEY
    );

    formData.append(
      "response",
      token
    );

    const clientIP = request.headers.get("CF-Connecting-IP");

    if (clientIP) {
      formData.append("remoteip", clientIP);
    }

    // Verify the token with Cloudflare.
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) {
      console.error("Turnstile verification service unavailable");
      return false;
    }

    const result = await response.json();

    // Accept tokens issued only for our staging hostname.
    const expectedHostname =
      "heliora-care-staging.kharetanitin.workers.dev";

    if (
      result.success !== true ||
      result.hostname !== expectedHostname
    ) {
      console.warn("Turnstile verification rejected", {
  success: result.success === true,
  error_codes: Array.isArray(result["error-codes"])
    ? result["error-codes"]
    : [],
  hostname_matches: result.hostname === expectedHostname
});
      return false;
    }

    return true;

  } catch (error) {
    console.error("Turnstile verification failed:", error);
    return false;
  }
}
// ------------------------------------------------------------
// BOOKING SUBMISSION
// ------------------------------------------------------------

async function createBooking(
  request,
  env,
  authorizedTest = false
) {

  // Public bookings remain disabled until activation.

  if (
    !authorizedTest &&
    env.ENABLE_BOOKINGS !== "true"
  ) {
    return json({
      error:
        "Bookings are not enabled. This is a staging deployment."
    }, 503);
  }

  if (!env.DB) {
    return json({
      error: "Database not configured"
    }, 503);
  }

  // Normal booking requests must come from the same origin.
  // Authorized test requests can use an API client.

  const origin = request.headers.get("Origin");

  if (
    !authorizedTest &&
    (!origin || origin !== new URL(request.url).origin)
  ) {
    return json({
      error: "Origin not permitted"
    }, 403);
  }

  const contentType =
    request.headers.get("content-type") || "";

  if (
    !contentType.toLowerCase().startsWith(
      "application/json"
    )
  ) {
    return json({
      error: "Content-Type must be application/json"
    }, 415);
  }

  const contentLength = Number(
    request.headers.get("content-length") || 0
  );

  if (contentLength > 12000) {
    return json({
      error: "Request too large"
    }, 413);
  }

  let body;

  try {
    const raw = await request.text();

    if (new TextEncoder().encode(raw).length > 12000) {
      return json({
        error: "Request too large"
      }, 413);
    }

    body = JSON.parse(raw);

  } catch {
    return json({
      error: "Invalid JSON request"
    }, 400);
  }

   if (!validBody(body)) {
    return json({
      error: "Invalid booking information"
    }, 400);
  }

  // ----------------------------------------------------------
  // VERIFY CLOUDFLARE TURNSTILE FOR PUBLIC BOOKINGS
  // ----------------------------------------------------------

  if (!authorizedTest) {

    const turnstileValid = await verifyTurnstile(
      body.turnstile_token,
      request,
      env
    );

    if (!turnstileValid) {
      return json({
        error:
          "Security verification failed. Please complete the verification and try again."
      }, 403);
    }
  }

  // Prevent duplicate submissions.
  // Prevent duplicate submissions.

  const existing = await env.DB.prepare(`
    SELECT booking_reference
    FROM appointments
    WHERE submission_id = ?
    LIMIT 1
  `).bind(body.submission_id).first();

  if (existing) {
    return json({
      error: "Booking already submitted",
      booking_reference: existing.booking_reference
    }, 409);
  }

  // Validate appointment date and time.

  const validSlot = await verifyAppointmentSlot(
    env,
    body.preferred_date,
    body.preferred_time
  );

  if (!validSlot) {
    return json({
      error: "Invalid or expired appointment slot"
    }, 400);
  }

  // Validate selected diagnostic tests.

  const testsValid = await validateSelectedTests(
    env,
    body.test_ids
  );

  if (!testsValid) {
    return json({
      error: "One or more tests are unavailable"
    }, 400);
  }

  const reference = generateBookingReference();

  // ----------------------------------------------------------
  // ATOMIC DATABASE TRANSACTION
  // ----------------------------------------------------------
  //
  // D1 batch executes these statements transactionally.
  //
  // Current capacity is limited to five by the database
  // CHECK constraint on appointment_slot_capacity.
  //
  // If capacity is exceeded, the transaction fails and
  // its changes are rolled back.
  //
  // ----------------------------------------------------------

  const statements = [];

  // 1. Reserve appointment capacity.

  statements.push(
    env.DB.prepare(`
      INSERT INTO appointment_slot_capacity (
        appointment_date,
        appointment_time,
        booked_count
      )
      VALUES (?, ?, 1)

      ON CONFLICT (
        appointment_date,
        appointment_time
      )

      DO UPDATE SET
        booked_count = booked_count + 1
    `).bind(
      body.preferred_date,
      body.preferred_time
    )
  );

  // 2. Save appointment.

  statements.push(
    env.DB.prepare(`
      INSERT INTO appointments (
        booking_reference,
        patient_name,
        patient_email,
        patient_phone,
        appointment_type,
        preferred_date,
        preferred_time,
        collection_address,
        status,
        submission_id
      )

      VALUES (
        ?, ?, ?, ?, ?, ?, ?, NULL, 'Pending', ?
      )
    `).bind(
      reference,
      body.patient_name.trim(),
      body.patient_email.trim(),
      body.patient_phone.trim(),
      body.appointment_type,
      body.preferred_date,
      body.preferred_time,
      body.submission_id
    )
  );

  // 3. Save selected diagnostic tests.

  for (const testId of body.test_ids) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO appointment_tests (
          appointment_id,
          test_id
        )

        SELECT id, ?
        FROM appointments
        WHERE submission_id = ?
      `).bind(
        testId,
        body.submission_id
      )
    );
  }

  try {
    await env.DB.batch(statements);

    return json({
      success: true,
      message: "Appointment request received",
      booking_reference: reference,
      appointment_date: body.preferred_date,
      appointment_time: body.preferred_time,
      status: "Pending"
    }, 201);

  } catch (error) {
    console.error("Booking transaction failed", error);

    const duplicate = await env.DB.prepare(`
      SELECT booking_reference
      FROM appointments
      WHERE submission_id = ?
      LIMIT 1
    `).bind(body.submission_id).first();

    if (duplicate) {
      return json({
        error: "Booking already submitted",
        booking_reference: duplicate.booking_reference
      }, 409);
    }

    return json({
      error:
        "Booking could not be completed. Please choose another available slot."
    }, 409);
  }
}


// ------------------------------------------------------------
// PROTECTED STAGING TEST AUTHENTICATION
// ------------------------------------------------------------

function validTestSecret(request, env) {
  if (
    typeof env.BOOKING_TEST_SECRET !== "string" ||
    env.BOOKING_TEST_SECRET.length < 32
  ) {
    return false;
  }

  const suppliedSecret =
    request.headers.get("X-Booking-Test-Secret");

  if (!suppliedSecret) {
    return false;
  }

  const encoder = new TextEncoder();

  const expected = encoder.encode(
    env.BOOKING_TEST_SECRET
  );

  const supplied = encoder.encode(
    suppliedSecret
  );

  if (expected.length !== supplied.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < expected.length; i++) {
    difference |= expected[i] ^ supplied[i];
  }

  return difference === 0;
}


// ------------------------------------------------------------
// MAIN WORKER
// ------------------------------------------------------------

export default {
  async fetch(request, env) {

    const url = new URL(request.url);
    const path = url.pathname;

    // --------------------------------------------------------
    // HEALTH CHECK
    // --------------------------------------------------------

    if (path === "/api/health") {
      return json({
        ok: true,
        service: "heliora-care",
        database_bound: !!env.DB,
        bookings_enabled:
          env.ENABLE_BOOKINGS === "true"
      });
    }

    // --------------------------------------------------------
    // PROTECTED STAGING BOOKING TEST
    // --------------------------------------------------------

    if (path === "/api/internal/test-booking") {

      if (request.method !== "POST") {
        return json({
          error: "Method not allowed"
        }, 405, {
          allow: "POST"
        });
      }

      // Never allow this endpoint on the live website.

      if (
        url.hostname !==
        "heliora-care-staging.kharetanitin.workers.dev"
      ) {
        return json({
          error: "Not found"
        }, 404);
      }

      if (
        typeof env.BOOKING_TEST_SECRET !== "string" ||
        env.BOOKING_TEST_SECRET.length < 32
      ) {
        return json({
          error: "Testing is not configured"
        }, 503);
      }

      if (!validTestSecret(request, env)) {
        return json({
          error: "Unauthorized"
        }, 401);
      }

      // Authorized test requests reuse the normal booking
      // validation and transactional database logic.

      try {
        return await createBooking(
          request,
          env,
          true
        );

      } catch (error) {
        console.error(
          "Protected booking test failed",
          error
        );

        return json({
          error:
            "Unable to process test booking."
        }, 503);
      }
    }
// --------------------------------------------------------
// TURNSTILE VERIFICATION TEST — STAGING ONLY
// --------------------------------------------------------

if (
  path === "/api/internal/test-turnstile" &&
  request.method === "POST"
) {
  const expectedHost =
    "heliora-care-staging.kharetanitin.workers.dev";

  const currentHost = new URL(request.url).hostname;

  if (currentHost !== expectedHost) {
    return json({ error: "Not available" }, 404);
  }

  if (env.ENABLE_BOOKINGS !== "false") {
    return json({ error: "Test endpoint disabled" }, 403);
  }
// Allow only authorized staging test requests.
if (!validTestSecret(request, env)) {
  return json({
    error: "Unauthorized"
  }, 401);
}
  try {
    const body = await request.json();

    const result = await verifyTurnstile(
      body.turnstile_token,
      request,
      env
    );

    return json({
      success: result === true,
      verification_passed: result === true
    }, result === true ? 200 : 403);

  } catch (error) {
    return json({
      success: false,
      error: "Verification failed"
    }, 400);
  }
}
    // --------------------------------------------------------
    // ADMIN API — DISABLED
    // --------------------------------------------------------
// --------------------------------------------------------
// ADMIN AUTHENTICATION TEST — STAGING ONLY
// --------------------------------------------------------
// ============================================================
// ADMIN DASHBOARD — APPOINTMENT STATISTICS
// STAGING ONLY — READ-ONLY
// ============================================================
// ============================================================
// ADMIN DASHBOARD — APPOINTMENT LISTING
// STAGING ONLY — READ-ONLY
// ============================================================
// ============================================================
// ADMIN — APPOINTMENT APPROVAL / REJECTION
// STAGING ONLY — SUPER ADMIN
// ============================================================

if (path === "/api/admin/appointments/status") {

  // Staging environment only.
  if (
    url.hostname !==
    "heliora-care-staging.kharetanitin.workers.dev"
  ) {
    return json({ error: "Not found" }, 404);
  }

  // Only POST requests are allowed.
  if (request.method !== "POST") {
    return json(
      { error: "Method not allowed" },
      405,
      { allow: "POST" }
    );
  }

  // Verify Cloudflare Access and staff authorization.
  const admin = await verifyAdminAccess(request, env);

  if (!admin) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (admin.role !== "super_admin") {
    return json({ error: "Forbidden" }, 403);
  }

  // Require JSON.
  const contentType =
    request.headers.get("content-type") || "";

  if (
    !contentType.toLowerCase().startsWith(
      "application/json"
    )
  ) {
    return json(
      { error: "Content-Type must be application/json" },
      415
    );
  }

  // Require a same-origin request.
  const origin = request.headers.get("Origin");

  if (origin !== url.origin) {
    return json({ error: "Origin not permitted" }, 403);
  }

  let body;

  try {
    const raw = await request.text();

    if (new TextEncoder().encode(raw).length > 4096) {
      return json({ error: "Request too large" }, 413);
    }

    body = JSON.parse(raw);

  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return json({ error: "Invalid request" }, 400);
  }

  const appointmentId = body.appointment_id;
  const newStatus = body.status;

  if (
    !Number.isSafeInteger(appointmentId) ||
    appointmentId < 1
  ) {
    return json({ error: "Invalid appointment ID" }, 400);
  }

  if (
    newStatus !== "Confirmed" &&
    newStatus !== "Rejected"
  ) {
    return json({ error: "Invalid appointment status" }, 400);
  }

  try {

    // Verify that the appointment exists.
    const appointment = await env.DB.prepare(`
      SELECT id, status
      FROM appointments
      WHERE id = ?
      LIMIT 1
    `).bind(appointmentId).first();

    if (!appointment) {
      return json({ error: "Appointment not found" }, 404);
    }

    if (
      String(appointment.status).toLowerCase() !== "pending"
    ) {
      return json({
        error: "Only pending appointments can be updated"
      }, 409);
    }

 

// Update appointment status and record the authenticated administrator.
// Database triggers handle audit logging and slot release atomically.

const result = await env.DB.prepare(`
  UPDATE appointments
  SET
    status = ?,
    status_updated_by = ?
  WHERE id = ?
    AND LOWER(status) = 'pending'
  RETURNING id, status
`).bind(
  newStatus,
  admin.email,
  appointmentId
).first();

if (!result) {
  return json({
    error: "Appointment was already updated"
  }, 409);
}

return json({
  success: true,
  appointment_id: result.id,
  status: result.status,
  message: "Appointment status updated successfully"
});


   

  } catch (error) {

    console.error(
      "Appointment status update failed:",
      error.message
    );

    return json({
      error: "Unable to update appointment status"
    }, 503);

  }
}
if (path === "/api/admin/appointments") {

  // Restrict access to staging.
  if (
    url.hostname !==
    "heliora-care-staging.kharetanitin.workers.dev"
  ) {
    return json({ error: "Not found" }, 404);
  }

  // Only GET requests are permitted.
  if (request.method !== "GET") {
    return json(
      { error: "Method not allowed" },
      405,
      { allow: "GET" }
    );
  }

  // Verify Cloudflare Access JWT and active staff account.
  const admin = await verifyAdminAccess(request, env);

  if (!admin) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Restrict patient information to Super Admin for now.
  if (admin.role !== "super_admin") {
    return json({ error: "Forbidden" }, 403);
  }

  // Search and filter parameters.
  const search = (url.searchParams.get("search") || "").trim();
  const status = (url.searchParams.get("status") || "").trim();

  // Limit search input.
  if (search.length > 100) {
    return json({ error: "Search is too long" }, 400);
  }

  // Allow only supported status filters.
  const allowedStatuses = [
    "",
    "pending",
    "confirmed",
    "rejected"
  ];

  if (!allowedStatuses.includes(status.toLowerCase())) {
    return json({ error: "Invalid status filter" }, 400);
  }

  // Pagination: maximum 50 appointments per request.
  const limit = 20;
  const pageInput = url.searchParams.get("page") || "1";
  const page = Number(pageInput);

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000
  ) {
    return json({ error: "Invalid page number" }, 400);
  }

  const offset = (page - 1) * limit;

  try {

    // Escape LIKE wildcards so searches are predictable.
    const escapedSearch = search
      .replace(/[\\%_]/g, "\\$&");

    const searchPattern = `%${escapedSearch}%`;

    const statusFilter = status.toLowerCase();

    const { results } = await env.DB.prepare(`
      SELECT
        a.id,
        a.booking_reference,
        a.patient_name,
        a.patient_email,
        a.patient_phone,
        a.appointment_type,
        a.preferred_date,
        a.preferred_time,
        a.status,
        a.created_at,
        (
          SELECT GROUP_CONCAT(dt.test_name, ', ')
          FROM appointment_tests at
          JOIN diagnostic_tests dt
            ON dt.id = at.test_id
          WHERE at.appointment_id = a.id
        ) AS selected_tests
      FROM appointments a
      WHERE
        (
          ? = ''
          OR a.patient_name LIKE ? ESCAPE '\\'
          OR a.booking_reference LIKE ? ESCAPE '\\'
        )
        AND
        (
          ? = ''
          OR LOWER(a.status) = ?
        )
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?
    `).bind(
      search,
      searchPattern,
      searchPattern,
      statusFilter,
      statusFilter,
      limit,
      offset
    ).all();

    return json({
      success: true,
      page,
      limit,
      count: results.length,
      appointments: results
    });

  } catch (error) {

    console.error(
      "Admin appointment listing error:",
      error.message
    );

    return json({
      error: "Unable to retrieve appointments"
    }, 503);

  }
}
if (path === "/api/admin/stats") {

  // Restrict this endpoint to the staging environment.
  if (
    url.hostname !==
    "heliora-care-staging.kharetanitin.workers.dev"
  ) {
    return json({ error: "Not found" }, 404);
  }

  // Only GET requests are permitted.
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, {
      allow: "GET"
    });
  }

  // Verify Cloudflare Access and the active staff account.
  const admin = await verifyAdminAccess(request, env);

  if (!admin) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Only the Super Admin can access statistics for now.
  if (admin.role !== "super_admin") {
    return json({ error: "Forbidden" }, 403);
  }

  try {
    const result = await env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN LOWER(status) = 'pending'
            THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN LOWER(status) IN ('confirmed', 'approved')
            THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN LOWER(status) = 'rejected'
            THEN 1 ELSE 0 END) AS rejected
      FROM appointments
    `).first();

    return json({
      success: true,
      total: Number(result?.total ?? 0),
      pending: Number(result?.pending ?? 0),
      confirmed: Number(result?.confirmed ?? 0),
      rejected: Number(result?.rejected ?? 0)
    });

  } catch (error) {
    console.error("Admin statistics error:", error.message);

    return json({
      error: "Unable to retrieve appointment statistics"
    }, 503);
  }
}
if (path === "/api/admin/me") {

  // Never expose this endpoint on the live website.
  if (
    url.hostname !==
    "heliora-care-staging.kharetanitin.workers.dev"
  ) {
    return json({ error: "Not found" }, 404);
  }

  // Allow only GET requests.
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, {
      allow: "GET"
    });
  }

  // Verify Cloudflare Access JWT and staff authorization.
  const admin = await verifyAdminAccess(request, env);

  if (!admin) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Return only non-sensitive account information.
  return json({
    success: true,
    authenticated: true,
    email: admin.email,
    role: admin.role
  });
}
    if (path.startsWith("/api/admin/")) {
      return json({
        error:
          "Admin API disabled pending authentication and role checks."
      }, 403);
    }

    // --------------------------------------------------------
    // DIAGNOSTIC TEST CATALOGUE
    // --------------------------------------------------------

    if (
      path === "/api/tests" &&
      request.method === "GET"
    ) {

      if (!env.DB) {
        return json({
          error: "Database not configured"
        }, 503);
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

        return json({
          tests: results
        });

      } catch (error) {
        console.error(
          "Unable to load tests",
          error
        );

        return json({
          error: "Unable to load tests"
        }, 503);
      }
    }

    // --------------------------------------------------------
    // AVAILABLE APPOINTMENT SLOTS
    // --------------------------------------------------------

    if (path === "/api/slots") {

      if (request.method !== "GET") {
        return json({
          error: "Method not allowed"
        }, 405, {
          allow: "GET"
        });
      }

      if (!env.DB) {
        return json({
          error: "Database not configured"
        }, 503);
      }

      const date =
        url.searchParams.get("date");

      if (!validDate(date)) {
        return json({
          error:
            "Please provide a valid date in YYYY-MM-DD format."
        }, 400);
      }

      try {
        const result = await getAvailableSlots(
          env,
          date
        );

        return json(result);

      } catch (error) {
        console.error(
          "Unable to retrieve appointment slots",
          error
        );

        return json({
          error:
            "Unable to retrieve available appointment times."
        }, 503);
      }
    }

    // --------------------------------------------------------
    // PUBLIC BOOKING SUBMISSIONS
    // --------------------------------------------------------

    if (path === "/api/bookings") {

      if (request.method !== "POST") {
        return json({
          error: "Method not allowed"
        }, 405, {
          allow: "POST"
        });
      }

      try {
        return await createBooking(
          request,
          env,
          false
        );

      } catch (error) {
        console.error(
          "Booking request failed",
          error
        );

        return json({
          error:
            "Unable to process the booking request."
        }, 503);
      }
    }

    // --------------------------------------------------------
    // UNKNOWN API ROUTES
    // --------------------------------------------------------

    if (path.startsWith("/api/")) {
      return json({
        error: "Not found"
      }, 404);
    }

    // --------------------------------------------------------
    // STATIC WEBSITE
    // --------------------------------------------------------

    return env.ASSETS.fetch(request);
  }
};
