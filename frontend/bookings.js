const bookingsDialog = document.querySelector("#bookings-dialog");
const bookingsList = document.querySelector("#bookings-list");
const bookingsMessage = document.querySelector("#bookings-message");
const bookingsMore = document.querySelector("#bookings-more");
const bookingsRetry = document.querySelector("#bookings-retry");
let bookingsPage = 1;
let bookingsVersion = 0;
let stripeTestReady = false;
let checkoutReturn =
  window.location.hash === "#checkout=returned" ||
  window.location.hash === "#checkout=cancelled";
if (checkoutReturn)
  history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );

async function bookingRequest(path, method = "GET", body) {
  const response = await fetch(`/api/v1/bookings${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({
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
    section.append(createAvailability(tour));
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
  section.append(
    createAvailability(tour, (date) => {
      dateInput.value = date;
      dateInput.dispatchEvent(new Event("change"));
    }),
  );
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
      `${booking.status === "confirmed" ? "Confirmed" : booking.status === "cancelled" ? "Cancelled" : "Pending"} · ${{ paid: "Paid", checkout: "Checkout in progress", refund_pending: "Refund pending", refunded: "Refunded", unpaid: "Unpaid" }[booking.paymentStatus] || (booking.paid ? "Paid" : "Unpaid")}`,
    ),
  );
  card.append(element("small", "", `Reference: ${booking._id}`));
  if (
    booking.status === "pending" &&
    !booking.paid &&
    date > new Date().toISOString().slice(0, 10)
  ) {
    if (booking.checkoutLocked) {
      card.append(
        element(
          "p",
          "booking-note",
          "Stripe test checkout is active. Seats stay protected until payment is confirmed or checkout is verified as closed.",
        ),
      );
      addCheckoutControls(card, booking, true);
      return card;
    }
    const held =
      booking.holdStatus === "held" &&
      new Date(booking.holdExpiresAt) > new Date();
    const holdInfo = element(
      "p",
      "hold-info",
      held
        ? "Seats held temporarily."
        : booking.holdStatus === "expired"
          ? "Your previous seat hold expired."
          : "Seats are not held.",
    );
    if (held) holdInfo.dataset.holdExpires = booking.holdExpiresAt;
    const holdAction = element(
      "button",
      "button secondary",
      held ? "Release seats" : "Hold seats for 15 minutes",
    );
    holdAction.type = "button";
    const holdFeedback = element("p");
    holdFeedback.setAttribute("role", "status");
    holdAction.addEventListener("click", async () => {
      const version = bookingsVersion;
      holdAction.disabled = true;
      try {
        const result = await bookingRequest(
          `/${booking._id}/hold`,
          held ? "DELETE" : "POST",
        );
        if (version === bookingsVersion && bookingsDialog.open)
          card.replaceWith(renderBooking(result.data.booking));
      } catch (error) {
        holdFeedback.textContent = error.message;
        holdAction.disabled = false;
      }
    });
    card.append(holdInfo, holdAction, holdFeedback);
    if (held) addCheckoutControls(card, booking, false);
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
    try {
      const configuration = await api("/api/v1/payments/status");
      stripeTestReady = configuration.data.enabled;
    } catch {
      stripeTestReady = false;
    }
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
  if (window.location.pathname !== "/trips") {
    window.location.assign("/trips");
    return;
  }
  if (!currentUser) {
    accountButton.click();
    return;
  }
  if (!bookingsDialog.open) bookingsDialog.show();
  loadMyBookings();
}
document
  .querySelector("#my-bookings")
  .addEventListener("click", showMyBookings);
document
  .querySelector("#bookings-refresh")
  .addEventListener("click", () =>
    currentUser ? loadMyBookings() : showMyBookings(),
  );
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
  if (bookingsDialog.open && window.location.pathname !== "/trips")
    bookingsDialog.close();
  if (dialog.open && !window.location.pathname.startsWith("/tours/"))
    dialog.close();
  openCheckoutReturn();
});

function openCheckoutReturn() {
  if (checkoutReturn && currentUser) {
    checkoutReturn = false;
    const notice = document.querySelector("#checkout-return-message");
    notice.hidden = false;
    notice.textContent =
      "You returned from Stripe test checkout. Returning here does not prove payment. Only server-verified payments become confirmed; refresh to see the latest status. If you left checkout unpaid, use Cancel checkout to release the seats.";
    showMyBookings();
  }
}
openCheckoutReturn();

function addCheckoutControls(card, booking, locked) {
  const feedback = element("p");
  feedback.setAttribute("role", "status");
  const pay = element(
    "button",
    "button primary",
    locked ? "Continue test checkout" : "Pay with Stripe · test mode",
  );
  pay.type = "button";
  pay.disabled = !stripeTestReady;
  if (!stripeTestReady)
    feedback.textContent =
      "Stripe test checkout is not configured yet. No payment can be taken.";
  pay.addEventListener("click", async () => {
    const version = bookingsVersion;
    pay.disabled = true;
    feedback.textContent = "Opening secure Stripe test checkout…";
    try {
      const result = await bookingRequest(`/${booking._id}/checkout`, "POST");
      if (version !== bookingsVersion || !bookingsDialog.open) return;
      const url = new URL(result.data.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
        throw new Error("An invalid checkout address was returned.");
      window.location.assign(url.href);
    } catch (error) {
      feedback.textContent = `${error.message} Refresh My bookings before changing this request.`;
      pay.disabled = !stripeTestReady;
    }
  });
  card.append(pay, feedback);
  if (locked) {
    const cancel = element("button", "button secondary", "Cancel checkout");
    cancel.type = "button";
    cancel.addEventListener("click", async () => {
      const version = bookingsVersion;
      cancel.disabled = true;
      pay.disabled = true;
      try {
        await bookingRequest(`/${booking._id}/checkout/cancel`, "POST");
        if (version === bookingsVersion && bookingsDialog.open)
          await loadMyBookings();
      } catch (error) {
        feedback.textContent = error.message;
        cancel.disabled = false;
        pay.disabled = !stripeTestReady;
      }
    });
    card.append(cancel);
  }
}

function createAvailability(tour, selectDate) {
  const panel = element("aside", "departure-availability");
  const message = element("p", "", "Loading scheduled departures…");
  message.setAttribute("role", "status");
  const options = element("div", "departure-options");
  const refresh = element(
    "button",
    "account-button",
    "Refresh seat availability",
  );
  refresh.type = "button";
  panel.append(
    element("h4", "", "Scheduled departures"),
    message,
    options,
    refresh,
  );
  async function load() {
    refresh.disabled = true;
    try {
      const response = await fetch(
        `/api/v1/departures?tourId=${encodeURIComponent(tour._id)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok)
        throw new Error(
          "Seat availability could not be loaded. Please refresh to try again.",
        );
      const result = await response.json();
      options.replaceChildren();
      message.textContent = result.data.departures.length
        ? "Availability can change. Requests do not hold seats until you choose Hold seats in My bookings."
        : "No seat inventory has been published yet. You can still submit an unpaid request.";
      for (const departure of result.data.departures) {
        const choice = element(
          selectDate ? "button" : "p",
          "departure-choice",
          `${departure.date.slice(0, 10)} · ${departure.closed ? "Closed" : `${departure.availableSeats} of ${departure.capacity} seats available`}`,
        );
        if (selectDate) {
          choice.type = "button";
          choice.disabled = departure.closed || departure.availableSeats === 0;
          choice.addEventListener("click", () =>
            selectDate(departure.date.slice(0, 10)),
          );
        }
        options.append(choice);
      }
    } catch (error) {
      message.textContent = error.message;
    } finally {
      refresh.disabled = false;
    }
  }
  refresh.addEventListener("click", load);
  load();
  return panel;
}

setInterval(() => {
  for (const label of document.querySelectorAll("[data-hold-expires]")) {
    const remaining =
      new Date(label.dataset.holdExpires).getTime() - Date.now();
    label.textContent =
      remaining > 0
        ? `Seats held for ${Math.ceil(remaining / 60000)} more minute(s). Payment is not confirmed.`
        : "Hold expired. Refresh bookings to check availability and hold again.";
  }
}, 1000);
