const USERNAME_ALLOWED_PATTERN = /^[A-Za-z0-9 _-]+$/;

export function normalizeUsername(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateUsername(value) {
  const rawValue = String(value || "").trim();
  const username = normalizeUsername(value);

  if (!username && rawValue) {
    return {
      valid: false,
      username,
      message: "Use letters, numbers, spaces, dashes, or underscores.",
    };
  }

  if (username.length < 2 || username.length > 20) {
    return {
      valid: false,
      username,
      message: "Name must be 2-20 characters.",
    };
  }

  if (!USERNAME_ALLOWED_PATTERN.test(username)) {
    return {
      valid: false,
      username,
      message: "Use letters, numbers, spaces, dashes, or underscores.",
    };
  }

  return {
    valid: true,
    username,
    message: "",
  };
}
