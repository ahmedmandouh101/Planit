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
  const visible = loaded.filter((tour) =>
    `${tour.name} ${tour.startLocation?.address || ""}`
      .toLocaleLowerCase()
      .includes(query),
  );
  grid.replaceChildren(...visible.map(renderCard));
  count.textContent = `${visible.length} ${visible.length === 1 ? "experience" : "experiences"} found`;
  status.hidden = visible.length > 0;
  status.textContent = selectedQuery
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
    render();
    loadMore.hidden = result.results < limit;
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
loadTours();
