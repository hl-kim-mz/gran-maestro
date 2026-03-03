export type ToastType = 'success' | 'error';

const TOAST_DURATION_MS = 3000;
const TOAST_FADE_MS = 300;

function getToastColor(type: ToastType): string {
  if (type === 'error') {
    return '#dc3545';
  }
  return '#28a745';
}

export function showToast(message: string, type: ToastType = 'success'): void {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.top = '16px';
  host.style.right = '16px';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .gm-toast {
      font-family: Arial, sans-serif;
      min-width: 260px;
      max-width: min(420px, calc(100vw - 32px));
      color: #fff;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
      opacity: 1;
      transition: opacity 300ms ease;
      background: ${getToastColor(type)};
      word-break: keep-all;
      pointer-events: auto;
    }
  `;

  const toast = document.createElement('div');
  toast.className = 'gm-toast';
  toast.textContent = message;

  shadow.append(style, toast);
  document.body.appendChild(host);

  window.setTimeout(() => {
    toast.style.opacity = '0';
  }, TOAST_DURATION_MS);
  window.setTimeout(() => {
    host.remove();
  }, TOAST_DURATION_MS + TOAST_FADE_MS);
}
