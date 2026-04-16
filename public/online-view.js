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
