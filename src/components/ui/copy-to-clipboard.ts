export async function copyTextToClipboard(value: string): Promise<boolean> {
  const clipboard = globalThis.navigator?.clipboard;

  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(value);
      return true;
    } catch {
      // Fall back to the legacy DOM copy path when the Clipboard API is unavailable.
    }
  }

  const doc = globalThis.document;
  if (!doc?.body || typeof doc.createElement !== "function" || typeof doc.execCommand !== "function") {
    return false;
  }

  const textArea = doc.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.setAttribute("aria-hidden", "true");
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "-9999px";
  textArea.style.opacity = "0";

  doc.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  if (typeof textArea.setSelectionRange === "function") {
    textArea.setSelectionRange(0, value.length);
  }

  try {
    return doc.execCommand("copy");
  } catch {
    return false;
  } finally {
    doc.body.removeChild(textArea);
  }
}
