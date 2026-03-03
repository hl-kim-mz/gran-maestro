import { scanLandmarkElements } from './landmark-scanner';
import { BadgeRenderer, OverlayBadgeItem } from './badge-renderer';

const OVERLAY_BADGE_MAX_COUNT = 50;
const REFRESH_DELAY_MS = 500;
let overlayBadgeCounter = 1;

export class OverlayBadgeManager {
  private readonly doc: Document;
  private readonly renderer: BadgeRenderer;
  private readonly onBadgeSelect: (element: Element) => void;
  private readonly mutationObserver: MutationObserver;
  private readonly win: Window | null;

  private active = false;
  private refreshTimeoutId: number | null = null;
  private scrollFrameId = 0;

  constructor(options: { doc?: Document; onBadgeSelect: (element: Element) => void }) {
    this.doc = options.doc ?? document;
    this.onBadgeSelect = options.onBadgeSelect;
    this.renderer = new BadgeRenderer(this.doc);
    this.mutationObserver = new MutationObserver(() => this.scheduleRefresh());
    this.win = this.doc.defaultView;
  }

  activate(): void {
    if (this.active) {
      return;
    }

    this.active = true;
    overlayBadgeCounter = 1;
    this.renderBadges();
    this.attachObservers();
  }

  deactivate(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.detachObservers();
    this.renderer.removeAll();
  }

  refresh(): void {
    if (!this.active) {
      return;
    }
    this.renderBadges();
  }

  private renderBadges(): void {
    overlayBadgeCounter = 1;
    const elements = scanLandmarkElements(this.doc).slice(0, OVERLAY_BADGE_MAX_COUNT);
    const items: OverlayBadgeItem[] = elements.map((element) => ({
      element,
      index: overlayBadgeCounter++
    }));

    this.renderer.render(items, this.onBadgeSelect);
  }

  private attachObservers(): void {
    if (!this.doc.documentElement) {
      return;
    }

    if (!this.win) {
      return;
    }

    this.mutationObserver.observe(this.doc.documentElement, {
      childList: true,
      subtree: true
    });
    this.win.addEventListener('scroll', this.handleScroll, { capture: true, passive: true });
    this.win.addEventListener('resize', this.handleResize);
  }

  private detachObservers(): void {
    if (!this.win) {
      return;
    }

    this.mutationObserver.disconnect();
    this.win.removeEventListener('scroll', this.handleScroll, { capture: true });
    this.win.removeEventListener('resize', this.handleResize);

    if (this.refreshTimeoutId !== null) {
      clearTimeout(this.refreshTimeoutId);
      this.refreshTimeoutId = null;
    }

    if (this.scrollFrameId !== 0) {
      cancelAnimationFrame(this.scrollFrameId);
      this.scrollFrameId = 0;
    }
  }

  private scheduleRefresh = (): void => {
    if (!this.active) {
      return;
    }

    if (this.refreshTimeoutId !== null) {
      return;
    }

    this.refreshTimeoutId = window.setTimeout(() => {
      this.refreshTimeoutId = null;
      this.renderBadges();
    }, REFRESH_DELAY_MS);
  };

  private handleScroll = (): void => {
    if (!this.active) {
      return;
    }

    if (this.scrollFrameId !== 0) {
      return;
    }

    this.scrollFrameId = requestAnimationFrame(() => {
      this.scrollFrameId = 0;
      if (this.active) {
        this.renderBadges();
      }
    });
  };

  private handleResize = (): void => {
    if (!this.active) {
      return;
    }
    this.renderBadges();
  };
}
