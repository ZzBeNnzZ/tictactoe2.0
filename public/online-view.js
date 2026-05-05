const statusFlipTokens = new WeakMap();

export function getOnlineVisibilityState(view) {
  const isGame = view === "game";

  return {
    pageView: isGame ? "online-game" : "online-lobby",
    lobbyHidden: isGame,
    gameHidden: !isGame,
  };
}

export function formatOnlineRoomCode(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  return normalizedCode ? `Room ${normalizedCode}` : "Room";
}

export function flipStatusMessage(el, message, type, { autoHide = false } = {}) {
  const token = (statusFlipTokens.get(el) || 0) + 1;
  statusFlipTokens.set(el, token);

  const isCurrent = () => statusFlipTokens.get(el) === token;
  const applyMessage = () => {
    if (!isCurrent()) {
      return;
    }

    el.textContent = message;
    el.dataset.type = type || "";
    el.hidden = false;
    el.classList.remove("flip-out");
    el.classList.add("flip-in");
    el.addEventListener("animationend", () => {
      if (isCurrent()) {
        el.classList.remove("flip-in");
      }
    }, { once: true });
  };

  if (!message) {
    el.textContent = "";
    el.dataset.type = "";
    el.classList.remove("flip-in");
    el.classList.remove("flip-out");
    if (autoHide) el.hidden = true;
    return;
  }

  if (el.textContent && !el.hidden && !el.classList.contains("flip-out")) {
    el.classList.remove("flip-in");
    el.classList.add("flip-out");
    el.addEventListener("animationend", applyMessage, { once: true });
    return;
  }

  el.classList.remove("flip-out");
  applyMessage();
}
