(() => {
  const recoveryDialog = document.querySelector("#recovery-dialog");
  const recoveryForm = document.querySelector("#recovery-form");
  const message = document.querySelector("#recovery-message");
  const submit = document.querySelector("#recovery-submit");
  const close = document.querySelector("#close-recovery");
  const back = document.querySelector("#recovery-back");
  const again = document.querySelector("#recovery-again");
  let resetToken = null;
  let mode = "request";
  let busy = false;

  function showMode(nextMode) {
    mode = nextMode;
    recoveryForm.reset();
    message.textContent = "";
    const requesting = mode === "request";
    const resetting = mode === "reset";
    for (const [field, enabled] of [
      ["email", requesting],
      ["password", resetting],
      ["confirm", resetting],
    ]) {
      document.querySelector(`#recovery-${field}-field`).hidden = !enabled;
      document.querySelector(`#recovery-${field}`).disabled = !enabled;
    }
    submit.hidden = !requesting && !resetting;
    submit.textContent = resetting ? "Save new password" : "Send reset link";
    again.hidden = requesting || mode === "success";
    back.textContent =
      mode === "success" ? "Continue exploring" : "Back to login";
    const titles = {
      request: "Forgot your password?",
      reset: "A fresh start.",
      sent: "Check your inbox.",
      invalid: "This link is not available.",
      success: "You’re all set.",
    };
    const descriptions = {
      request: "Enter your email and we’ll send you a link to reset it.",
      reset:
        "Choose a new password with at least 8 characters. Your reset link can only be used once.",
      sent: "If an account exists for this email, a reset link will arrive shortly. Check your spam folder too. The link expires in 10 minutes.",
      invalid:
        "The reset link is invalid, expired, or has already been used. Request a new link to continue.",
      success:
        "Your password has been updated. You can now continue with your Planit account.",
    };
    document.querySelector("#recovery-title").textContent = titles[mode];
    document.querySelector("#recovery-description").textContent =
      descriptions[mode];
  }

  function openRequest() {
    resetToken = null;
    showMode("request");
    if (!recoveryDialog.open) recoveryDialog.showModal();
    document.querySelector("#recovery-email").focus();
  }

  document.querySelector("#forgot-password").addEventListener("click", () => {
    if (document.querySelector("#auth-submit").disabled) return;
    document.querySelector("#auth-dialog").close();
    openRequest();
  });
  again.addEventListener("click", openRequest);
  close.addEventListener("click", () => recoveryDialog.close());
  recoveryDialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  recoveryDialog.addEventListener("close", () => {
    recoveryForm.reset();
    resetToken = null;
  });
  back.addEventListener("click", () => {
    const completed = mode === "success";
    recoveryDialog.close();
    if (!completed) document.querySelector("#auth-dialog").showModal();
  });

  recoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const resetting = mode === "reset";
    const fields = new FormData(recoveryForm);
    if (resetting && fields.get("password") !== fields.get("confirmPassword")) {
      message.textContent = "Passwords do not match. Please try again.";
      return;
    }
    busy = true;
    for (const button of [submit, close, back, again]) button.disabled = true;
    message.textContent = resetting
      ? "Updating your password…"
      : "Sending your request…";
    try {
      const response = await fetch(
        resetting
          ? `/api/v1/users/resetPassword/${resetToken}`
          : "/api/v1/users/forgetPassword",
        {
          method: resetting ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(
            resetting
              ? {
                  password: fields.get("password"),
                  confirmPassword: fields.get("confirmPassword"),
                }
              : { email: fields.get("email").trim() },
          ),
          signal: AbortSignal.timeout(15000),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        if (
          resetting &&
          response.status === 400 &&
          result.message?.includes("token")
        ) {
          resetToken = null;
          showMode("invalid");
          return;
        }
        throw new Error(
          result.message ||
            "We could not complete your request. Please try again.",
        );
      }
      resetToken = null;
      showMode(resetting ? "success" : "sent");
      if (resetting) document.dispatchEvent(new Event("planit:password-reset"));
    } catch (error) {
      message.textContent =
        error.name === "TimeoutError"
          ? "The request took too long. Please try again."
          : error.message;
    } finally {
      busy = false;
      for (const button of [submit, close, back, again])
        button.disabled = false;
    }
  });

  function openResetLink() {
    if (!window.location.hash.startsWith("#reset-password=")) return;
    if (busy) return;
    resetToken = window.location.hash.slice("#reset-password=".length);
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    showMode(/^[a-f0-9]{64}$/.test(resetToken) ? "reset" : "invalid");
    document.querySelector("#auth-dialog").close();
    if (!recoveryDialog.open) recoveryDialog.showModal();
  }
  window.addEventListener("hashchange", openResetLink);
  openResetLink();
})();
