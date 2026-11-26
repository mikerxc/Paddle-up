/** Shares plain text, then copies it if the share sheet isn't available. */
export async function shareText(title: string, text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, text });
      return "shared";
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "failed";
  }
  return (await copyText(text)) ? "copied" : "failed";
}

/** Copies plain text. Uses the clipboard API, then a hidden selection if that is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission or an insecure context. Try the legacy path below.
  }
  try {
    if (typeof document === "undefined") return false;
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}
