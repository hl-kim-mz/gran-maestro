const CLIPBOARD_MAX_MEMO_LENGTH = 50;

function getClipboardMemo(memo: string, fallbackSelector: string): string {
  const source = memo.trim() || fallbackSelector.trim();
  return source.length > CLIPBOARD_MAX_MEMO_LENGTH ? source.slice(0, CLIPBOARD_MAX_MEMO_LENGTH) : source;
}

export function buildCaptureClipboardText(captureId: string, memo: string, selector: string): string {
  return `/mst:plan [${captureId}] ${getClipboardMemo(memo, selector)}`.trim();
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  textarea.setAttribute('readonly', 'true');
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}
