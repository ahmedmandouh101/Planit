const grid = document.querySelector("#tour-grid");
const status = document.querySelector("#status");
const count = document.querySelector("#result-count");
const retry = document.querySelector("#retry");
const loadMore = document.querySelector("#load-more");
const form = document.querySelector("#filters");
const dialog = document.querySelector("#tour-dialog");
const content = document.querySelector("#dialog-content");
const levels = {
  easy: "Easy",
  medium: "Moderate",
  difficult: "Challenging",
};
const limit = 12;
let page = 1;
let requestVersion = 0;
let loaded = [];
let selectedQuery = "";
let selectedDifficulty = "";
let selectedSort = "price";
let savedOnly = false;
let currentUser = null;
let accountTours = [];
let accountBusy = true;
let hasMoreTours = false;
let savedTours;
try {
  const stored = JSON.parse(localStorage.getItem("planit-saved") || "[]");
  savedTours = new Set(
    Array.isArray(stored)
      ? stored.filter((identifier) => typeof identifier === "string")
      : [],
  );
} catch {
  savedTours = new Set();
}
const savedToggle = document.querySelector("#saved-toggle");
const savedCount = document.querySelector("#saved-count");
savedCount.textContent = savedTours.size;

async function toggleSaved(tour, button) {
  if (accountBusy) return;
  const removing = savedTours.has(tour._id);
  if (currentUser) {
    accountBusy = true;
    button.disabled = true;
    try {
      await accountRequest(
        `/saved-tours/${encodeURIComponent(tour._id)}`,
        removing ? "DELETE" : "PUT",
      );
      accountTours = removing
        ? accountTours.filter((saved) => saved._id !== tour._id)
        : [...accountTours, tour];
    } catch (error) {
      document.querySelector("#save-feedback").textContent = error.message;
      button.disabled = false;
      accountBusy = false;
      return;
    }
    button.disabled = false;
    accountBusy = false;
  }
  if (savedTours.has(tour._id)) savedTours.delete(tour._id);
  else savedTours.add(tour._id);
  try {
    if (!currentUser)
      localStorage.setItem("planit-saved", JSON.stringify([...savedTours]));
    document.querySelector("#save-feedback").textContent = savedTours.has(
      tour._id,
    )
      ? currentUser
        ? "Experience saved to your account."
        : "Experience saved on this browser. Log in to save to an account."
      : "Experience removed from saved.";
  } catch {
    document.querySelector("#save-feedback").textContent =
      "Saved for this visit. Browser storage is unavailable.";
  }
  savedCount.textContent = savedTours.size;
  button.textContent = savedTours.has(tour._id) ? "♥" : "♡";
  button.setAttribute("aria-pressed", String(savedTours.has(tour._id)));
  if (savedOnly) render();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(path) {
  const response = await fetch(path, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Unable to load data. Please try again.");
  return response.json();
}

function price(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function renderCard(tour) {
  const card = element("article", "tour-card");
  const visual = element("div", "card-image");
  const image = element("img");
  image.src =
    tour.imageCover === "demo-placeholder.svg"
      ? "/demo-placeholder.svg"
      : `/img/tours/${encodeURIComponent(tour.imageCover || "")}`;
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener(
    "error",
    () => {
      image.src = "/demo-placeholder.svg";
    },
    { once: true },
  );
  visual.append(
    image,
    element("span", "card-badge", levels[tour.difficulty] || "Experience"),
  );
  const save = element(
    "button",
    "save-button",
    savedTours.has(tour._id) ? "♥" : "♡",
  );
  save.type = "button";
  save.setAttribute("aria-label", `Save ${tour.name}`);
  save.setAttribute("aria-pressed", String(savedTours.has(tour._id)));
  save.addEventListener("click", () => toggleSaved(tour, save));
  visual.append(save);
  const body = element("div", "card-body");
  body.append(
    element(
      "p",
      "card-location",
      `↗ ${tour.startLocation?.address || "Discover the destination"}`,
    ),
    element("h3", "", tour.name),
  );
  body.append(element("p", "card-summary", tour.summary || ""));
  const meta = element("div", "card-meta");
  meta.append(
    element(
      "span",
      "",
      `${tour.duration || "—"} ${tour.duration === 1 ? "day" : "days"}`,
    ),
    element(
      "span",
      "",
      tour.ratingsQuantity
        ? `★ ${tour.ratingsAverage} (${tour.ratingsQuantity})`
        : "Not yet reviewed",
    ),
  );
  const footer = element("div", "card-footer");
  const amount = element("span", "price", price(tour.price));
  amount.append(element("small", "", "/ person"));
  const button = element("button", "detail-button", "View details ↗");
  button.type = "button";
  button.setAttribute("aria-label", `View ${tour.name} details`);
  button.addEventListener("click", () => showDetails(tour._id));
  footer.append(amount, button);
  body.append(meta, footer);
  card.append(visual, body);
  return card;
}

function render() {
  const query = selectedQuery.toLocaleLowerCase();
  const visible = (savedOnly && currentUser ? accountTours : loaded).filter(
    (tour) =>
      (!savedOnly || savedTours.has(tour._id)) &&
      (!selectedDifficulty || tour.difficulty === selectedDifficulty) &&
      `${tour.name} ${tour.startLocation?.address || ""}`
        .toLocaleLowerCase()
        .includes(query),
  );
  const sortField = selectedSort.replace("-", "");
  visible.sort(
    (first, second) =>
      (first[sortField] - second[sortField]) *
      (selectedSort.startsWith("-") ? -1 : 1),
  );
  loadMore.hidden = !hasMoreTours || (savedOnly && Boolean(currentUser));
  grid.replaceChildren(...visible.map(renderCard));
  count.textContent = `${visible.length} ${visible.length === 1 ? "experience" : "experiences"} found`;
  status.hidden = visible.length > 0;
  status.textContent = savedOnly
    ? "No saved experiences in these results. Save a tour with the heart button, or load more experiences."
    : selectedQuery
      ? "No matching experiences in the loaded results. Try another destination or load more tours."
      : "No experiences match these filters. Try a different activity level.";
}

async function loadTours(append = false) {
  const version = ++requestVersion;
  grid.setAttribute("aria-busy", "true");
  retry.hidden = true;
  loadMore.disabled = true;
  if (!append) {
    page = 1;
    loaded = [];
    grid.replaceChildren();
    status.hidden = false;
    status.textContent = "Loading experiences…";
    count.textContent = "Finding experiences…";
    loadMore.hidden = true;
  }
  const params = new URLSearchParams({ page, limit, sort: selectedSort });
  if (selectedDifficulty) params.set("difficulty", selectedDifficulty);
  try {
    const result = await api(`/api/v1/tours?${params}`);
    if (version !== requestVersion) return;
    loaded.push(...result.data.data);
    hasMoreTours = result.results === limit;
    render();
  } catch (error) {
    if (version !== requestVersion) return;
    loadMore.hidden = true;
    status.hidden = false;
    status.textContent =
      error.name === "TimeoutError"
        ? "This is taking longer than expected. Please try again."
        : "We could not load the experiences. Check your connection and try again.";
    count.textContent = "Experiences unavailable";
    retry.hidden = false;
    retry.onclick = () => loadTours(append);
  } finally {
    if (version === requestVersion) {
      grid.setAttribute("aria-busy", "false");
      loadMore.disabled = false;
    }
  }
}

let detailVersion = 0;
async function showDetails(identifier) {
  const version = ++detailVersion;
  const loadingTitle = element("h2", "", "Loading tour details…");
  loadingTitle.id = "dialog-title";
  content.replaceChildren(loadingTitle);
  dialog.showModal();
  try {
    const result = await api(`/api/v1/tours/${encodeURIComponent(identifier)}`);
    if (version !== detailVersion || !dialog.open) return;
    const tour = result.data.data;
    content.replaceChildren(
      element("p", "eyebrow", "YOUR EXPERIENCE, AT A GLANCE"),
      element("h2", "", tour.name),
    );
    content.querySelector("h2").id = "dialog-title";
    content.append(element("p", "", tour.description || tour.summary));
    const details = element("dl", "detail-list");
    for (const [label, value] of [
      ["Price per person", price(tour.price)],
      [
        "Duration",
        `${tour.duration || "—"} ${tour.duration === 1 ? "day" : "days"}`,
      ],
      ["Activity level", levels[tour.difficulty] || "Not specified"],
      [
        "Group size",
        tour.MaxGroupSize
          ? `Up to ${tour.MaxGroupSize} guests`
          : "Not specified",
      ],
    ]) {
      const row = element("div");
      row.append(element("dt", "", label), element("dd", "", value));
      details.append(row);
    }
    content.append(
      details,
      element("p", "", tour.startLocation?.address || ""),
      element(
        "p",
        "booking-note",
        "Explore now, travel later. Online booking and payments are not available yet.",
      ),
    );
  } catch {
    if (version === detailVersion && dialog.open) {
      const errorTitle = element("h2", "", "Tour details unavailable");
      errorTitle.id = "dialog-title";
      content.replaceChildren(
        errorTitle,
        element("p", "", "Please close this window and try again."),
      );
    }
  }
}

document
  .querySelector("#close-dialog")
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  detailVersion += 1;
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  selectedQuery = document.querySelector("#query").value.trim();
  selectedDifficulty = document.querySelector("#difficulty").value;
  selectedSort = document.querySelector("#sort").value;
  loadTours();
});
loadMore.addEventListener("click", () => {
  page += 1;
  loadTours(true);
});
savedToggle.addEventListener("click", () => {
  savedOnly = !savedOnly;
  savedToggle.setAttribute("aria-pressed", String(savedOnly));
  render();
  document.querySelector("#explore").scrollIntoView({ behavior: "auto" });
});
const accountButton = document.querySelector("#account-button");
const logoutButton = document.querySelector("#logout-button");
const authDialog = document.querySelector("#auth-dialog");
const authForm = document.querySelector("#auth-form");
const authMessage = document.querySelector("#auth-message");
const authSubmit = document.querySelector("#auth-submit");
let signupMode = false;

async function accountRequest(path, method = "GET", body) {
  const response = await fetch(`/api/v1/users${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      result.message || "Something went wrong. Please try again.",
    );
    error.status = response.status;
    throw error;
  }
  return result;
}

function updateAccount() {
  accountButton.textContent = currentUser
    ? `Hi, ${currentUser.name.split(" ")[0]}`
    : "Log in / Sign up";
  logoutButton.hidden = !currentUser;
  savedCount.textContent = savedTours.size;
  render();
}

async function restoreAccount(strict = false) {
  try {
    const profile = await accountRequest("/me");
    const saved = await accountRequest("/saved-tours");
    currentUser = profile.data.data;
    accountTours = saved.data.tours;
    savedTours = new Set(accountTours.map((tour) => tour._id));
  } catch (error) {
    if (strict) throw error;
    if (error.status !== 401)
      document.querySelector("#save-feedback").textContent =
        "Account could not be loaded. Refresh to try again.";
  } finally {
    accountBusy = false;
    updateAccount();
  }
}

accountButton.addEventListener("click", () => {
  if (currentUser) {
    savedOnly = true;
    savedToggle.setAttribute("aria-pressed", "true");
    render();
    document.querySelector("#explore").scrollIntoView();
    return;
  }
  authMessage.textContent = "";
  authDialog.showModal();
});
document
  .querySelector("#close-auth")
  .addEventListener("click", () => authDialog.close());
document.querySelector("#auth-switch").addEventListener("click", () => {
  signupMode = !signupMode;
  document.querySelector("#auth-title").textContent = signupMode
    ? "Your journey starts here."
    : "Welcome back.";
  document.querySelector("#auth-description").textContent = signupMode
    ? "Create an account to save experiences across your devices."
    : "Log in to keep your favourite experiences together.";
  document.querySelector("#name-field").hidden = !signupMode;
  document.querySelector("#confirm-field").hidden = !signupMode;
  document.querySelector("#auth-name").required = signupMode;
  document.querySelector("#auth-confirm").required = signupMode;
  document.querySelector("#auth-name").disabled = !signupMode;
  document.querySelector("#auth-confirm").disabled = !signupMode;
  document.querySelector("#auth-password").autocomplete = signupMode
    ? "new-password"
    : "current-password";
  authSubmit.textContent = signupMode ? "Create account" : "Log in";
  document.querySelector("#auth-switch").textContent = signupMode
    ? "Already have an account? Log in"
    : "New to Planit? Create an account";
  authMessage.textContent = "";
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fields = new FormData(authForm);
  const body = {
    email: fields.get("email").trim(),
    password: fields.get("password"),
  };
  if (signupMode) {
    body.name = fields.get("name").trim();
    body.confirmPassword = fields.get("confirmPassword");
    if (!body.name || body.password !== body.confirmPassword) {
      authMessage.textContent = !body.name
        ? "Please enter your name."
        : "Passwords do not match.";
      return;
    }
  }
  authSubmit.disabled = true;
  document.querySelector("#auth-switch").disabled = true;
  accountBusy = true;
  authMessage.textContent = "Connecting…";
  try {
    await accountRequest(signupMode ? "/signup" : "/login", "POST", body);
    await restoreAccount(true);
    authForm.reset();
    authDialog.close();
    document.querySelector("#save-feedback").textContent =
      "You are logged in. Hearts now save to your account.";
  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    accountBusy = false;
    authSubmit.disabled = false;
    document.querySelector("#auth-switch").disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  if (accountBusy) return;
  accountBusy = true;
  logoutButton.disabled = true;
  try {
    await accountRequest("/logout");
    currentUser = null;
    accountTours = [];
    try {
      const stored = JSON.parse(localStorage.getItem("planit-saved") || "[]");
      savedTours = new Set(
        Array.isArray(stored)
          ? stored.filter((identifier) => typeof identifier === "string")
          : [],
      );
    } catch {
      savedTours = new Set();
    }
    updateAccount();
    document.querySelector("#save-feedback").textContent =
      "You are logged out.";
  } catch (error) {
    document.querySelector("#save-feedback").textContent = error.message;
  } finally {
    accountBusy = false;
    logoutButton.disabled = false;
  }
});
restoreAccount().then(() => loadTours());
