document.querySelectorAll("[data-destination]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector('#saved-toggle[aria-pressed="true"]')?.click();
    document.querySelector("#query").value = button.dataset.destination;
    document.querySelector("#difficulty").value = "";
    document.querySelector("#filters").requestSubmit();
    document
      .querySelector("#explore")
      .scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    document.querySelector("#query").focus({ preventScroll: true });
  });
});
