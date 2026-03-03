import {
  INSPECT_OVERLAY_HOST_ATTRIBUTE,
  INSPECT_OVERLAY_MIN_SIZE,
  INSPECT_OVERLAY_STYLES
} from './styles';

export interface HighlighterOptions {
  doc?: Document;
}

export class Highlighter {
  private readonly doc: Document;
  private readonly host: HTMLDivElement;
  private readonly box: HTMLDivElement;
  private readonly shadowRoot: ShadowRoot;
  private currentTarget: Element | null = null;

  constructor(options: HighlighterOptions = {}) {
    this.doc = options.doc ?? document;
    this.host = this.doc.createElement('div');
    this.host.setAttribute(INSPECT_OVERLAY_HOST_ATTRIBUTE, 'true');
    this.host.style.display = 'none';
    this.host.style.position = 'absolute';
    this.host.style.pointerEvents = 'none';
    this.host.style.zIndex = '2147483647';

    this.shadowRoot = this.host.attachShadow({ mode: 'open' });
    const style = this.doc.createElement('style');
    const box = this.doc.createElement('div');
    style.textContent = INSPECT_OVERLAY_STYLES;
    box.className = 'gm-inspector-box';

    this.shadowRoot.append(style, box);
    this.box = box;
  }

  mount(): void {
    const container = this.doc.body ?? this.doc.documentElement;
    if (container && !this.host.isConnected) {
      container.appendChild(this.host);
    }
  }

  unmount(): void {
    this.hide();
    if (this.host.isConnected) {
      this.host.remove();
    }
  }

  isOverlayElement(node: Element | null): boolean {
    return !!node && (node === this.host || this.host.contains(node));
  }

  setTarget(target: Element | null): void {
    if (!target) {
      this.currentTarget = null;
      this.hide();
      return;
    }

    const rect = target.getBoundingClientRect();
    const width = Math.max(rect.width, INSPECT_OVERLAY_MIN_SIZE);
    const height = Math.max(rect.height, INSPECT_OVERLAY_MIN_SIZE);
    const left = rect.left + this.doc.defaultView!.scrollX;
    const top = rect.top + this.doc.defaultView!.scrollY;

    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
    this.host.style.width = `${width}px`;
    this.host.style.height = `${height}px`;
    this.box.style.width = `${width}px`;
    this.box.style.height = `${height}px`;

    this.currentTarget = target;
    this.host.style.display = 'block';
  }

  refresh(): void {
    this.setTarget(this.currentTarget);
  }

  hide(): void {
    this.host.style.display = 'none';
  }
}
