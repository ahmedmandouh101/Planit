const screenPath = window.location.pathname;
const isTourPage = /^\/tours\/[^/]+$/.test(screenPath);
const isWorkspace =
  ["/explore", "/saved", "/trips", "/profile"].includes(screenPath) ||
  isTourPage;
document.body.dataset.screen = isTourPage
  ? "tour"
  : screenPath.slice(1) || "home";

document.querySelectorAll('a[href="#explore"]').forEach((link) => {
  link.href = "/explore";
});
document.querySelectorAll('a[href="#destinations"]').forEach((link) => {
  link.href = "/#destinations";
});
document.querySelectorAll('.site-header a[href="#how"]').forEach((link) => {
  link.href = "/#how";
});
document.querySelectorAll(".app-nav a").forEach((link) => {
  if (link.getAttribute("href") === screenPath)
    link.setAttribute("aria-current", "page");
});

if (isWorkspace) {
  document
    .querySelectorAll(
      "main > .hero, main > .journey-bar, main > .ticker, main > .destinations, main > .how, main > .travel-notes",
    )
    .forEach((section) => {
      section.hidden = true;
    });
  document.querySelector("#explore").hidden = !["/explore", "/saved"].includes(
    screenPath,
  );
  const heading = document.querySelector("#workspace-heading");
  heading.hidden = false;
  const titles = {
    "/explore": [
      "Find your kind of adventure.",
      "Explore Egypt at your pace. Compare experiences, discover destinations, and make room for something different.",
    ],
    "/saved": [
      "A little inspiration, saved.",
      "Your wishlist. Keep the experiences you love together until you’re ready to go.",
    ],
    "/trips": [
      "Your next chapter.",
      "Manage your requests, seat holds, and confirmed trips in one place.",
    ],
    "/profile": [
      "Make yourself at home.",
      "Your Planit account. Keep your details up to date for your next adventure.",
    ],
  };
  const [title, description] = titles[screenPath] || [
    "A closer look.",
    "Discover the details before you make it your next adventure.",
  ];
  document.querySelector("#workspace-title").textContent = title;
  document.querySelector("#workspace-description").textContent = description;
  document.title = `${screenPath === "/saved" ? "Wishlist" : screenPath === "/trips" ? "My trips" : screenPath === "/profile" ? "My account" : "Discover Egypt"} — Planit`;
  if (isTourPage) {
    dialog.classList.add("page-dialog");
    document.querySelector("main").append(dialog);
    document.querySelector("#close-dialog").hidden = true;
    const back = element("a", "back-link", "← Back to experiences");
    back.href = "/explore";
    dialog.before(back);
  }
  if (screenPath === "/explore") {
    const parameters = new URLSearchParams(window.location.search);
    const budget = parameters.get("budget");
    selectedBudget =
      budget !== null && /^\d{1,7}$/.test(budget) && Number(budget) <= 1000000
        ? budget
        : "";
    selectedDuration = ["1", "3", "7"].includes(parameters.get("duration"))
      ? parameters.get("duration")
      : "";
    document.querySelector("#budget").value = selectedBudget;
    document.querySelector("#trip-length").value = selectedDuration;
    selectedQuery = (parameters.get("q") || "").slice(0, 100);
    selectedDifficulty = ["easy", "medium", "difficult"].includes(
      parameters.get("difficulty"),
    )
      ? parameters.get("difficulty")
      : "";
    selectedSort = ["price", "-price", "duration"].includes(
      parameters.get("sort"),
    )
      ? parameters.get("sort")
      : "price";
    document.querySelector("#query").value = selectedQuery;
    document.querySelector("#difficulty").value = selectedDifficulty;
    document.querySelector("#sort").value = selectedSort;
  }
  if (screenPath === "/saved") {
    savedOnly = true;
    savedToggle.setAttribute("aria-pressed", "true");
    document.querySelector("#explore-title").textContent =
      "Your saved experiences";
  }
  if (screenPath === "/trips") {
    bookingsDialog.classList.add("page-dialog");
    document.querySelector("main").append(bookingsDialog);
    document.querySelector("#close-bookings").hidden = true;
    document.querySelector("#bookings-title").textContent = "My trips";
  }
}

function renderWorkspaceAccount() {
  if (screenPath === "/trips") {
    if (!bookingsDialog.open) bookingsDialog.show();
    if (currentUser) loadMyBookings();
    else {
      bookingsVersion += 1;
      bookingsList.replaceChildren();
      bookingsMore.hidden = true;
      bookingsRetry.hidden = true;
      bookingsMessage.replaceChildren(
        element(
          "p",
          "",
          "Log in to view your trips. Your bookings are private to your account.",
        ),
      );
      const login = element("button", "button primary", "Log in to My trips");
      login.type = "button";
      login.onclick = () => accountButton.click();
      bookingsMessage.append(login);
    }
  }
  if (isTourPage) showDetails(decodeURIComponent(screenPath.split("/")[2]));
  if (screenPath === "/profile") {
    const panel = document.querySelector("#profile-page");
    panel.hidden = false;
    panel.replaceChildren();
    if (!currentUser) {
      panel.append(
        element("h2", "", "A place for your plans."),
        element(
          "p",
          "",
          "Log in to manage your account, save experiences, and keep track of your trips.",
        ),
      );
      const login = element(
        "button",
        "button primary",
        "Log in or create an account",
      );
      login.onclick = () => accountButton.click();
      panel.append(login);
      return;
    }
    panel.append(
      element(
        "div",
        "profile-avatar",
        currentUser.name.slice(0, 1).toUpperCase(),
      ),
      element("h2", "", currentUser.name),
    );
    const profileForm = element("form", "auth-form");
    const nameLabel = element("label", "", "Full name");
    const nameInput = element("input");
    nameInput.value = currentUser.name;
    nameInput.required = true;
    nameInput.maxLength = 100;
    nameInput.autocomplete = "name";
    nameLabel.append(nameInput);
    const emailLabel = element("label", "", "Email address");
    const emailInput = element("input");
    emailInput.type = "email";
    emailInput.value = currentUser.email;
    emailInput.required = true;
    emailInput.autocomplete = "email";
    emailLabel.append(emailInput);
    const feedback = element("p");
    feedback.setAttribute("role", "status");
    const submit = element("button", "button primary", "Save account details");
    submit.type = "submit";
    profileForm.append(nameLabel, emailLabel, feedback, submit);
    profileForm.onsubmit = async (event) => {
      event.preventDefault();
      const owner = currentUser?._id;
      submit.disabled = true;
      try {
        const result = await accountRequest("/updateMe", "PATCH", {
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
        });
        if (!currentUser || currentUser._id !== owner) return;
        currentUser = result.data.user;
        accountButton.textContent = `Hi, ${currentUser.name.split(" ")[0]}`;
        feedback.textContent = "Your account details have been saved.";
      } catch (error) {
        feedback.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    };
    panel.append(
      profileForm,
      element(
        "p",
        "booking-note",
        "For password recovery, log out and choose Forgot your password on the login screen.",
      ),
    );
  }
}
document.addEventListener("planit:account-change", renderWorkspaceAccount);
renderWorkspaceAccount();
