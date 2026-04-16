import { validateUsername } from "./username.js";

const COOKIE_NAME = "ttt_username";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

let currentUsername = readUsernameCookie();

export function getCurrentUsername() {
  return currentUsername;
}

export function initIdentity() {
  const form = document.querySelector("#identity-form");
  const input = document.querySelector("#username-input");
  const current = document.querySelector("#identity-current");

  if (!form || !input || !current) {
    return;
  }

  input.value = currentUsername;
  renderIdentity(current, "");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = validateUsername(input.value);

    if (!result.valid) {
      renderIdentity(current, result.message);
      return;
    }

    currentUsername = result.username;
    writeUsernameCookie(currentUsername);
    input.value = currentUsername;
    renderIdentity(current, "");
    window.dispatchEvent(
      new CustomEvent("ttt:username-change", {
        detail: { username: currentUsername },
      }),
    );
  });
}

function renderIdentity(element, errorMessage) {
  if (errorMessage) {
    element.textContent = errorMessage;
    element.dataset.type = "error";
    return;
  }

  element.textContent = currentUsername
    ? `Playing as ${currentUsername}`
    : "Enter a name before playing online.";
  element.dataset.type = currentUsername ? "ready" : "waiting";
}

function readUsernameCookie() {
  const cookies = document.cookie.split(";").map((cookie) => cookie.trim());
  const cookie = cookies.find((entry) => entry.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) {
    return "";
  }

  const value = decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  const result = validateUsername(value);
  return result.valid ? result.username : "";
}

function writeUsernameCookie(username) {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    username,
  )}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}
