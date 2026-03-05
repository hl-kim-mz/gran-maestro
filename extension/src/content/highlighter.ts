import {
  INSPECT_OVERLAY_HOST_ATTRIBUTE,
  INSPECT_OVERLAY_MIN_SIZE,
  INSPECT_OVERLAY_STYLES
} from './styles';
import { getCSSPath } from './selector-display';

export interface HighlighterOptions {
  doc?: Document;
}

export class Highlighter {
  private readonly doc: Document;
  private readonly host: HTMLDivElement;
  private readonly box: HTMLDivElement;
  private readonly label: HTMLDivElement;
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
    const label = this.doc.createElement('div');
    style.textContent = INSPECT_OVERLAY_STYLES;
    box.className = 'gm-inspector-box';
    label.className = 'gm-inspector-label';

    this.shadowRoot.append(style, box, label);
    this.box = box;
    this.label = label;
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

    const win = this.doc.defaultView;
    if (!win) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const width = Math.max(rect.width, INSPECT_OVERLAY_MIN_SIZE);
    const height = Math.max(rect.height, INSPECT_OVERLAY_MIN_SIZE);
    const left = rect.left + win.scrollX;
    const top = rect.top + win.scrollY;

    if (target !== this.currentTarget) {
      this.label.textContent = this.buildLabelText(target, rect);
    }

    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
    this.host.style.width = `${width}px`;
    this.host.style.height = `${height}px`;
    this.box.style.width = `${width}px`;
    this.box.style.height = `${height}px`;
    this.host.style.display = 'block';

    const labelHeight = this.label.offsetHeight || 20;
    const labelWidth = this.label.offsetWidth || 100;
    const maxLeft = win.innerWidth - labelWidth - win.scrollX;
    const clampedLeft = Math.max(-left, Math.min(0, maxLeft - left));

    this.label.style.top = rect.top > labelHeight ? `${-labelHeight}px` : `${height}px`;
    this.label.style.left = `${clampedLeft}px`;

    this.currentTarget = target;
  }

  refresh(): void {
    this.setTarget(this.currentTarget);
  }

  hide(): void {
    this.host.style.display = 'none';
    this.currentTarget = null;
  }

  private buildLabelText(target: Element, rect: DOMRect): string {
    const tag = target.tagName.toLowerCase();
    let identifier = '';

    if (target.id) {
      identifier = `#${target.id}`;
    } else {
      const classes = Array.from(target.classList).slice(0, 2);
      if (classes.length > 0) {
        identifier = classes.map((className) => `.${className}`).join('');
      }
    }

    const size = `${Math.round(rect.width)}\u00d7${Math.round(rect.height)}`;
    const path = getCSSPath(target);
    return `${tag}${identifier}  ${size}  ${path}`;
  }
}
