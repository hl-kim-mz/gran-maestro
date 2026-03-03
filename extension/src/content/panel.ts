import { INLINE_PANEL_STYLES } from './panel-styles';
import { getCSSPath, getUniqueSelector } from './selector-display';
import { TagInput } from './tag-input';
import { buildCapturePayload, BuildCapturePayloadInput } from './capture';
import { CaptureMode, CapturePayload } from '../shared/types';

interface InlinePanelOptions {
  onCapture?: (mode: CaptureMode, payload: CapturePayload) => void | Promise<void>;
}

export class InlinePanel {
  private readonly doc: Document;
  private readonly host: HTMLDivElement;
  private readonly shadowRoot: ShadowRoot;
  private readonly selectorLine: HTMLDivElement;
  private readonly pathLine: HTMLDivElement;
  private readonly memoInput: HTMLTextAreaElement;
  private readonly tagInputRoot: HTMLDivElement;
  private readonly immediateButton: HTMLButtonElement;
  private readonly queueButton: HTMLButtonElement;
  private readonly tagInput: TagInput;
  private readonly onCapture?: (mode: CaptureMode, payload: CapturePayload) => void | Promise<void>;

  private readonly panelElement: HTMLDivElement;
  private readonly memoField: HTMLTextAreaElement;
  private isVisible = false;
  private currentSelector = '';
  private currentPath = '';
  private currentTarget: Element | null = null;

  private readonly panelPadding = 8;

  constructor(documentRef: Document = document, options: InlinePanelOptions = {}) {
    this.doc = documentRef;
    this.host = this.doc.createElement('div');
    this.host.setAttribute('data-gm-inline-panel', 'true');
    this.host.style.position = 'fixed';
    this.host.style.top = '0';
    this.host.style.left = '0';
    this.host.style.display = 'none';
    this.host.style.zIndex = '2147483647';
    this.host.style.pointerEvents = 'none';

    this.shadowRoot = this.host.attachShadow({ mode: 'open' });

    const style = this.doc.createElement('style');
    style.textContent = INLINE_PANEL_STYLES;
    const panelElement = this.doc.createElement('div');
    panelElement.className = 'gm-inline-panel';
    panelElement.tabIndex = -1;

    this.selectorLine = this.doc.createElement('div');
    this.selectorLine.className = 'gm-selector';

    this.pathLine = this.doc.createElement('div');
    this.pathLine.className = 'gm-path';

    this.memoInput = this.doc.createElement('textarea');
    this.memoInput.placeholder = '메모 입력...';
    this.memoInput.rows = 3;
    this.memoInput.className = 'gm-memo';

    const divider1 = this.doc.createElement('div');
    divider1.className = 'gm-divider';

    this.tagInputRoot = this.doc.createElement('div');
    this.tagInput = new TagInput(this.tagInputRoot);

    const divider2 = this.doc.createElement('div');
    divider2.className = 'gm-divider';

    const actions = this.doc.createElement('div');
    actions.className = 'gm-actions';

    this.immediateButton = this.doc.createElement('button');
    this.immediateButton.type = 'button';
    this.immediateButton.className = 'gm-action-btn gm-action-immediate';
    this.immediateButton.textContent = '즉시모드';

    this.queueButton = this.doc.createElement('button');
    this.queueButton.type = 'button';
    this.queueButton.className = 'gm-action-btn gm-action-queue';
    this.queueButton.textContent = '큐에 추가';

    const actionList = this.doc.createElement('div');
    actionList.className = 'gm-action-list';
    actionList.append(this.immediateButton, this.queueButton);
    actions.appendChild(actionList);

    panelElement.append(
      this.selectorLine,
      this.pathLine,
      this.memoInput,
      divider1,
      this.tagInputRoot,
      divider2,
      actions
    );

    this.shadowRoot.append(style, panelElement);

    this.panelElement = panelElement;
    this.memoField = this.memoInput;
    this.onCapture = options.onCapture;

    if (documentRef.body) {
      documentRef.body.appendChild(this.host);
    }

    this.immediateButton.addEventListener('click', () => {
      this.handleCapture('immediate');
    });
    this.queueButton.addEventListener('click', () => {
      this.handleCapture('batch');
    });
  }

  public show(target: Element): void {
    this.currentSelector = getUniqueSelector(target);
    this.currentPath = getCSSPath(target);
    this.currentTarget = target;

    this.selectorLine.textContent = this.currentSelector;
    this.selectorLine.title = this.currentSelector;
    this.pathLine.textContent = this.currentPath;
    this.pathLine.title = this.currentPath;

    this.memoInput.value = '';
    this.tagInput.reset();

    this.host.style.display = 'block';
    this.host.style.visibility = 'hidden';

    const rect = target.getBoundingClientRect();
    const panelRect = this.panelElement.getBoundingClientRect();
    const panelWidth = Math.max(panelRect.width, 240);
    const panelHeight = Math.max(panelRect.height, 120);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.left + rect.width / 2 - panelWidth / 2;
    let top = rect.bottom + this.panelPadding;

    if (top + panelHeight > viewportHeight - this.panelPadding) {
      top = rect.top - panelHeight - this.panelPadding;
    }

    if (top < this.panelPadding) {
      top = Math.min(rect.bottom + this.panelPadding, viewportHeight - panelHeight - this.panelPadding);
    }

    if (left + panelWidth > viewportWidth - this.panelPadding) {
      left = viewportWidth - panelWidth - this.panelPadding;
    }
    if (left < this.panelPadding) {
      left = this.panelPadding;
    }

    this.host.style.left = `${Math.max(0, Math.round(left))}px`;
    this.host.style.top = `${Math.max(0, Math.round(top))}px`;
    this.host.style.visibility = 'visible';
    this.host.style.pointerEvents = 'auto';
    this.isVisible = true;
  }

  public hide(): void {
    this.isVisible = false;
    this.host.style.display = 'none';
    this.host.style.pointerEvents = 'none';
    this.host.style.visibility = 'hidden';
  }

  public isOpen(): boolean {
    return this.isVisible;
  }

  public contains(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false;
    if (this.host === target || this.host.contains(target)) return true;
    return target.getRootNode() === this.shadowRoot;
  }

  private handleCapture(mode: CaptureMode): void {
    if (!this.isVisible) {
      return;
    }

    if (!this.currentTarget) {
      return;
    }

    const payloadInput: BuildCapturePayloadInput = {
      element: this.currentTarget,
      selector: this.currentSelector,
      cssPath: this.currentPath,
      memo: this.memoField.value,
      tags: this.tagInput.getTags(),
      mode
    };
    const payload = buildCapturePayload(payloadInput);
    void this.onCapture?.(mode, payload);
    this.hide();
  }
}
