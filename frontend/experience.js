document.querySelectorAll("[data-destination]").forEach((button) => {
  button.addEventListener("click", () => {
    window.location.assign(
      `/explore?q=${encodeURIComponent(button.dataset.destination)}`,
    );
  });
});
