const bookingsDialog = document.querySelector("#bookings-dialog");
const bookingsList = document.querySelector("#bookings-list");
const bookingsMessage = document.querySelector("#bookings-message");
const bookingsMore = document.querySelector("#bookings-more");
const bookingsRetry = document.querySelector("#bookings-retry");
let bookingsPage = 1;
let bookingsVersion = 0;

async function bookingRequest(path, method = "GET", body) {
  const response = await fetch(`/api/v1/bookings${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response
    .json()
    .catch(() => ({
      message:
        response.status === 429
          ? "Too many requests. Please try again later."
          : "We could not complete your request. Please try again.",
    }));
  if (!response.ok)
    throw new Error(
      result.message || "We could not complete your request. Please try again.",
    );
  return result;
}

function createBookingForm(tour) {
  const section = element("section", "booking-panel");
  section.append(element("h3", "", "Make it your next adventure"));
  if (!currentUser) {
    const login = element(
      "button",
      "button primary",
      "Log in to request a booking",
    );
    login.type = "button";
    login.addEventListener("click", () => {
      dialog.close();
      accountButton.click();
    });
    section.append(login);
    return section;
  }
  if (!Number.isInteger(tour.MaxGroupSize) || tour.MaxGroupSize < 1) {
    section.append(
      element("p", "", "This tour is not accepting booking requests yet."),
    );
    return section;
  }
  const bookingForm = element("form", "auth-form");
  const dateLabel = element("label", "", "Departure date (UTC)");
  const dates = [
    ...new Set((tour.startDates || []).map((start) => start.slice(0, 10))),
  ].filter((start) => start > new Date().toISOString().slice(0, 10));
  if ((tour.startDates || []).length && !dates.length) {
    section.append(
      element(
        "p",
        "",
        "No upcoming departures are available. Check back for new dates.",
      ),
    );
    return section;
  }
  const dateInput = element(
    (tour.startDates || []).length ? "select" : "input",
  );
  dateInput.required = true;
  dateInput.name = "departureDate";
  if (dateInput.tagName === "SELECT") {
    for (const date of dates) {
      const option = element("option", "", date);
      option.value = date;
      dateInput.append(option);
    }
  } else {
    dateInput.type = "date";
    dateInput.min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  }
  dateLabel.append(dateInput);
  const guestLabel = element(
    "label",
    "",
    `Guests (up to ${tour.MaxGroupSize})`,
  );
  const guestsInput = element("input");
  Object.assign(guestsInput, {
    type: "number",
    name: "guests",
    min: "1",
    max: String(tour.MaxGroupSize),
    step: "1",
    value: "1",
    required: true,
  });
  guestLabel.append(guestsInput);
  const total = element("p", "booking-total");
  const feedback = element("p", "");
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  const send = element("button", "button primary", "Request booking");
  send.type = "submit";
  let requestId = crypto.randomUUID();
  const requestUser = currentUser._id;
  const update = () => {
    requestId = crypto.randomUUID();
    const guests = Number(guestsInput.value);
    total.textContent = guestsInput.validity.valid
      ? `Estimated total: ${price((Math.round(tour.price * 100) * guests) / 100)} · unpaid`
      : "Choose a valid guest count.";
  };
  guestsInput.addEventListener("input", update);
  dateInput.addEventListener("change", update);
  update();
  bookingForm.append(dateLabel, guestLabel, total, feedback, send);
  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (send.disabled) return;
    if (!currentUser || currentUser._id !== requestUser) {
      feedback.textContent =
        "Your account changed. Close this window and reopen the tour.";
      return;
    }
    send.disabled = true;
    dateInput.disabled = true;
    guestsInput.disabled = true;
    feedback.textContent = "Submitting your request…";
    try {
      const result = await bookingRequest("", "POST", {
        tourId: tour._id,
        departureDate: dateInput.value,
        guests: Number(guestsInput.value),
        requestId,
      });
      if (!currentUser || currentUser._id !== requestUser || !dialog.open)
        return;
      const booking = result.data.booking;
      bookingForm.replaceChildren(
        element(
          "p",
          "booking-success",
          booking.status === "cancelled"
            ? "This request was already cancelled. Reopen the tour to start a new request."
            : `Request received. Total: ${price(booking.price)}. Pending and unpaid; seats are not reserved.`,
        ),
      );
      const view = element("button", "button primary", "View My bookings");
      view.type = "button";
      view.addEventListener("click", () => {
        dialog.close();
        showMyBookings();
      });
      bookingForm.append(view);
    } catch (error) {
      feedback.textContent = `${error.message} If the request timed out, retrying these details will not create a duplicate.`;
      send.disabled = false;
      dateInput.disabled = false;
      guestsInput.disabled = false;
    }
  });
  section.append(bookingForm);
  return section;
}

function renderBooking(booking) {
  const card = element("article", "my-booking");
  card.append(element("h3", "", booking.tourName));
  const date = booking.departureDate?.slice(0, 10);
  card.append(
    element(
      "p",
      "",
      `${date || "Date unavailable"} · ${booking.guests || "—"} guests · ${price(booking.price)}`,
    ),
  );
  card.append(
    element(
      "p",
      "booking-state",
      `${booking.status === "cancelled" ? "Cancelled" : "Pending"} · ${booking.paid ? "Paid" : "Unpaid"}`,
    ),
  );
  card.append(element("small", "", `Reference: ${booking._id}`));
  if (
    booking.status === "pending" &&
    !booking.paid &&
    date > new Date().toISOString().slice(0, 10)
  ) {
    const cancel = element("button", "button secondary", "Cancel request");
    cancel.type = "button";
    const feedback = element("p");
    feedback.setAttribute("role", "status");
    let confirming = false;
    cancel.addEventListener("click", async () => {
      if (!confirming) {
        confirming = true;
        cancel.textContent = "Confirm cancellation";
        feedback.textContent = "Click again to cancel this unpaid request.";
        return;
      }
      const version = bookingsVersion;
      cancel.disabled = true;
      try {
        const result = await bookingRequest(`/${booking._id}/cancel`, "PATCH");
        if (version === bookingsVersion && bookingsDialog.open)
          card.replaceWith(renderBooking(result.data.booking));
      } catch (error) {
        feedback.textContent = error.message;
        cancel.disabled = false;
      }
    });
    card.append(cancel, feedback);
  }
  return card;
}

async function loadMyBookings(append = false) {
  const version = ++bookingsVersion;
  bookingsMore.disabled = true;
  bookingsRetry.hidden = true;
  bookingsMessage.textContent = "Loading your bookings…";
  if (!append) {
    bookingsPage = 1;
    bookingsList.replaceChildren();
  }
  try {
    const result = await bookingRequest(`/mine?page=${bookingsPage}`);
    if (version !== bookingsVersion || !bookingsDialog.open) return;
    bookingsList.append(...result.data.bookings.map(renderBooking));
    bookingsMore.hidden = !result.hasMore;
    bookingsMessage.textContent = bookingsList.childElementCount
      ? ""
      : "No bookings yet. Explore a tour to request your next adventure.";
  } catch (error) {
    if (version !== bookingsVersion) return;
    bookingsMessage.textContent = error.message;
    bookingsRetry.hidden = false;
    bookingsMore.hidden = true;
    bookingsRetry.onclick = () => loadMyBookings(append);
  } finally {
    if (version === bookingsVersion) bookingsMore.disabled = false;
  }
}

function showMyBookings() {
  if (!currentUser) {
    accountButton.click();
    return;
  }
  bookingsDialog.showModal();
  loadMyBookings();
}
document
  .querySelector("#my-bookings")
  .addEventListener("click", showMyBookings);
document
  .querySelector("#close-bookings")
  .addEventListener("click", () => bookingsDialog.close());
bookingsDialog.addEventListener("close", () => {
  bookingsVersion += 1;
  bookingsList.replaceChildren();
});
bookingsMore.addEventListener("click", () => {
  bookingsPage += 1;
  loadMyBookings(true);
});
document.addEventListener("planit:account-change", () => {
  if (bookingsDialog.open) bookingsDialog.close();
  if (dialog.open) dialog.close();
});
