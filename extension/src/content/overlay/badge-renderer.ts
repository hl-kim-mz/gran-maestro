const BADGE_WIDTH_PX = 24;
const BADGE_HEIGHT_PX = 18;
const BADGE_VERTICAL_OFFSET_PX = 20;
const BADGE_HORIZONTAL_GAP_PX = 4;
const BADGE_Z_INDEX = 2147483648;
const MAX_BADGE_LABEL = 2;
const OVERLAY_ID_PREFIX = 'C-';

export interface OverlayBadgeItem {
  element: Element;
  index: number;
}

export type OverlayBadgeClickHandler = (element: Element) => void;

interface RenderedBadgePosition {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class BadgeRenderer {
  private readonly doc: Document;
  private readonly host: HTMLDivElement;
  private readonly shadowRoot: ShadowRoot;
  private readonly container: HTMLDivElement;
  private readonly renderedBadges = new Map<Element, HTMLElement>();

  constructor(doc: Document = document) {
    this.doc = doc;
    this.host = this.doc.createElement('div');
    this.host.style.position = 'absolute';
    this.host.style.left = '0';
    this.host.style.top = '0';
    this.host.style.width = '0';
    this.host.style.height = '0';
    this.host.style.pointerEvents = 'none';
    this.host.style.zIndex = String(BADGE_Z_INDEX);
    this.host.style.display = 'none';

    this.shadowRoot = this.host.attachShadow({ mode: 'open' });
    const style = this.doc.createElement('style');
    const container = this.doc.createElement('div');
    container.className = 'gm-overlay-badge-container';
    style.textContent = this.buildStyles();

    this.shadowRoot.append(style, container);
    this.container = container;
  }

  mount(): void {
    const mountPoint = this.doc.body ?? this.doc.documentElement;
    if (mountPoint && !this.host.isConnected) {
      mountPoint.appendChild(this.host);
    }
  }

  unmount(): void {
    this.removeAll();
    if (this.host.isConnected) {
      this.host.remove();
    }
  }

  render(items: OverlayBadgeItem[], onBadgeClick: OverlayBadgeClickHandler): void {
    this.mount();
    this.clear();
    const placed: RenderedBadgePosition[] = [];

    for (const item of items) {
      const badge = this.renderBadge(item, onBadgeClick);
      const position = this.resolvePosition(item.element, placed);
      badge.style.left = `${position.left}px`;
      badge.style.top = `${position.top}px`;

      placed.push({
        left: position.left,
        top: position.top,
        width: BADGE_WIDTH_PX,
        height: BADGE_HEIGHT_PX
      });

      this.container.appendChild(badge);
      this.renderedBadges.set(item.element, badge);
    }

    this.host.style.display = 'block';
  }

  removeAll(): void {
    this.clear();
    this.host.style.display = 'none';
  }

  private clear(): void {
    for (const badge of this.renderedBadges.values()) {
      badge.remove();
    }
    this.renderedBadges.clear();
  }

  private renderBadge(item: OverlayBadgeItem, onBadgeClick: OverlayBadgeClickHandler): HTMLElement {
    const badge = this.doc.createElement('button');
    badge.type = 'button';
    badge.className = 'gm-overlay-badge';
    badge.textContent = `${OVERLAY_ID_PREFIX}${String(item.index).padStart(MAX_BADGE_LABEL, '0')}`;
    badge.setAttribute('data-gm-overlay-id', String(item.index));
    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onBadgeClick(item.element);
    });
    return badge;
  }

  private resolvePosition(element: Element, placed: RenderedBadgePosition[]): RenderedBadgePosition {
    const rect = element.getBoundingClientRect();
    const baseLeft = rect.left + this.doc.defaultView!.scrollX;
    let top = rect.top + this.doc.defaultView!.scrollY - BADGE_VERTICAL_OFFSET_PX;
    if (top < 0) {
      top = rect.top + this.doc.defaultView!.scrollY;
    }

    let left = baseLeft;
    while (true) {
      const blocking = placed.find((item) => this.isOverlapping({ left, top }, item));
      if (!blocking) {
        break;
      }
      left = blocking.left + blocking.width + BADGE_HORIZONTAL_GAP_PX;
    }

    return {
      left,
      top,
      width: BADGE_WIDTH_PX,
      height: BADGE_HEIGHT_PX
    };
  }

  private isOverlapping(
    candidate: Pick<RenderedBadgePosition, 'left' | 'top'>,
    existing: RenderedBadgePosition
  ): boolean {
    const sameRow = Math.abs(candidate.top - existing.top) < BADGE_HEIGHT_PX;
    const horizontallyOverlap =
      candidate.left < existing.left + existing.width + BADGE_HORIZONTAL_GAP_PX &&
      candidate.left + BADGE_WIDTH_PX > existing.left - BADGE_HORIZONTAL_GAP_PX;
    return sameRow && horizontallyOverlap;
  }

  private buildStyles(): string {
    return `
      :host {
        position: absolute;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        z-index: ${BADGE_Z_INDEX};
        pointer-events: none;
      }

      .gm-overlay-badge-container {
        position: relative;
        pointer-events: none;
      }

      .gm-overlay-badge {
        position: absolute;
        width: ${BADGE_WIDTH_PX}px;
        height: ${BADGE_HEIGHT_PX}px;
        border: 0;
        border-radius: 4px;
        background: #ff6b35;
        color: #ffffff;
        font-family: 'Courier New', monospace;
        font-size: 10px;
        font-weight: 700;
        line-height: ${BADGE_HEIGHT_PX}px;
        text-align: center;
        padding: 0;
        margin: 0;
        box-sizing: border-box;
        pointer-events: auto;
        cursor: pointer;
      }
    `;
  }
}
