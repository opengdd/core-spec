export function safeZipPath(name) {
  const slashPath = String(name).replaceAll("\\", "/").replace(/^\.\//, "");
  const directory = slashPath.endsWith("/");
  const normalized = slashPath.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  if (!normalized
    || normalized.startsWith("/")
    || /^[A-Za-z]:/.test(normalized)
    || normalized.includes("\0")
    || normalized.split("/").some(part => part === "." || part === "..")) {
    throw new Error(`Unsafe zip path: ${name}`);
  }
  return directory ? `${normalized}/` : normalized;
}
