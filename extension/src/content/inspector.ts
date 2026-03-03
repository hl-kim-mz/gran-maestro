import { Highlighter } from './highlighter';
import { Navigator } from './navigator';
import { InlinePanel } from './panel';
import { captureScreenshotToWebP } from './screenshot';
import { buildCaptureClipboardText, copyTextToClipboard } from './clipboard';
import { showToast } from './toast';
import { MESSAGE_TYPES } from '../shared/constants';
import { CaptureMode, CapturePayload, CaptureSaveResponse } from '../shared/types';
import { sendToBackground } from '../shared/messages';

interface InspectorOptions {
  onSelect?: (element: Element) => void;
}

export class Inspector {
  private readonly highlighter: Highlighter;
  private readonly navigator: Navigator;
  private readonly panel: InlinePanel;
  private readonly onSelect?: (element: Element) => void;
  private readonly cursorRestoreTarget: HTMLElement | null;
  private active = false;
  private rafId: number | null = null;
  private pendingTarget: Element | null = null;
  private previousBodyCursor = '';

  constructor(options: InspectorOptions = {}) {
    this.highlighter = new Highlighter();
    this.navigator = new Navigator();
    this.panel = new InlinePanel(document, {
      onCapture: (mode: CaptureMode, payload: CapturePayload) => {
        void this.handleCapture(mode, payload);
      }
    });
    this.onSelect = options.onSelect;
    this.cursorRestoreTarget = document.body;
  }

  activate(): void {
    if (this.active) {
      return;
    }
    this.active = true;

    this.highlighter.mount();

    if (this.cursorRestoreTarget) {
      this.previousBodyCursor = this.cursorRestoreTarget.style.cursor;
      this.cursorRestoreTarget.style.cursor = 'crosshair';
    }

    document.addEventListener('mousemove', this.handleMouseMove, { capture: true });
    document.addEventListener('click', this.handleClick, { capture: true });
    document.addEventListener('keydown', this.handleKeyDown, { capture: true });
    document.addEventListener('scroll', this.handleScroll, { capture: true });
  }

  deactivate(): void {
    if (!this.active) {
      return;
    }
    this.active = false;

    document.removeEventListener('mousemove', this.handleMouseMove, { capture: true } as EventListenerOptions);
    document.removeEventListener('click', this.handleClick, { capture: true } as EventListenerOptions);
    document.removeEventListener('keydown', this.handleKeyDown, { capture: true } as EventListenerOptions);
    document.removeEventListener('scroll', this.handleScroll, { capture: true } as EventListenerOptions);

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.highlighter.unmount();
    this.panel.hide();
    this.pendingTarget = null;
    this.navigator.setCurrent(null);

    if (this.cursorRestoreTarget) {
      this.cursorRestoreTarget.style.cursor = this.previousBodyCursor;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.active) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const target = this.resolveTarget(event.target);
    if (!target) {
      return;
    }

    this.pendingTarget = target;
    if (this.rafId !== null) {
      return;
    }

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (this.pendingTarget) {
        this.setCurrent(this.pendingTarget);
        this.pendingTarget = null;
      }
    });
  };

  private handleClick = (event: MouseEvent): void => {
    if (!this.active) {
      return;
    }

    const target = this.resolveTarget(event.target);
    if (!target) {
      return;
    }

    if (this.panel.isOpen() && this.panel.contains(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (this.panel.isOpen()) {
      this.panel.hide();
      this.navigator.setCurrent(null);
      this.highlighter.hide();
      return;
    }

    this.setCurrent(target);
    const current = this.navigator.getCurrent();
    if (current) {
      this.panel.show(current);
      this.onSelect?.(current);
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.active) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (this.panel.isOpen()) {
        this.panel.hide();
        return;
      }
      this.deactivate();
      return;
    }

    if (this.panel.isOpen() && this.panel.contains(event.target)) {
      return;
    }

    if (
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight'
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const next = this.navigator.move(event.key);
    if (next) {
      this.setCurrent(next);
    }
  };

  private handleScroll = (): void => {
    if (!this.active) {
      return;
    }
    this.highlighter.refresh();
  };

  private setCurrent(target: Element): void {
    this.navigator.setCurrent(target);
    this.highlighter.setTarget(target);
  }

  private resolveTarget(target: EventTarget | null): Element | null {
    if (!(target instanceof Element)) {
      return null;
    }
    if (this.highlighter.isOverlayElement(target)) {
      return null;
    }
    if (this.panel.isOpen() && this.panel.contains(target)) {
      return null;
    }
    return target;
  }

  private async handleCapture(mode: CaptureMode, payload: CapturePayload): Promise<void> {
    try {
      const screenshotData = await captureScreenshotToWebP();
      const captureMessage = await sendToBackground<CaptureSaveResponse>({
        type: MESSAGE_TYPES.CAPTURE_SAVE,
        payload: {
          capture: {
            ...payload,
            screenshot_data: screenshotData
          }
        }
      });

      if (!captureMessage?.ok) {
        throw new Error(captureMessage?.error || '캡처 저장에 실패했습니다.');
      }

      const captureId = captureMessage.payload?.captureId ?? 'CAP-000';
      if (mode === 'immediate') {
        const copied = await copyTextToClipboard(buildCaptureClipboardText(captureId, payload.memo, payload.selector));
        if (copied) {
          showToast('캡처 완료! 클립보드에 복사됨', 'success');
        } else {
          showToast('클립보드 복사 실패. 수동 복사로 진행하세요.', 'error');
        }
      } else {
        showToast('캡처가 큐에 추가되었습니다.', 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      showToast(`캡처 실패: ${message}`, 'error');
    } finally {
      if (mode === 'immediate') {
        this.deactivate();
      }
    }
  }
}
