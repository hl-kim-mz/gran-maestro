import { CaptureMode, CapturePayload } from '../shared/types';
import { collectDegradationMetadata } from './degradation';

const MAX_HTML_SNAPSHOT_BYTES = 50 * 1024;

export interface BuildCapturePayloadInput {
  element: Element;
  selector: string;
  cssPath: string;
  memo: string;
  tags: string[];
  mode: CaptureMode;
}

function trimHtmlSnapshot(element: Element, maxLength: number): string | null {
  const html = element.outerHTML ?? '';
  if (html.length <= maxLength) {
    return html;
  }

  const clone = element.cloneNode(true) as Element;
  let removedNodes = 0;

  while (clone.childNodes.length > 0 && clone.outerHTML.length > maxLength) {
    const lastChild = clone.childNodes[clone.childNodes.length - 1];
    clone.removeChild(lastChild);
    removedNodes++;
  }

  if (removedNodes > 0 && clone.outerHTML.length > maxLength) {
    clone.textContent = '';
    const contentRemovedComment = clone.ownerDocument.createComment('truncated: content removed');
    clone.appendChild(contentRemovedComment);

    if (clone.outerHTML.length <= maxLength) {
      return clone.outerHTML;
    }
    return clone.outerHTML.slice(0, maxLength);
  }

  if (removedNodes === 0) {
    return html.slice(0, maxLength);
  }

  const truncatedComment = clone.ownerDocument.createComment(`truncated: ${removedNodes} nodes removed`);
  clone.appendChild(truncatedComment);
  if (clone.outerHTML.length <= maxLength) {
    return clone.outerHTML;
  }
  clone.removeChild(truncatedComment);

  return clone.outerHTML;
}

export function buildCapturePayload(input: BuildCapturePayloadInput): CapturePayload {
  const rect = input.element.getBoundingClientRect();
  const html = input.element.outerHTML ?? '';
  const memo = input.memo.trim();
  const selector = input.selector.trim();
  const cssPath = input.cssPath.trim();
  const degradation = collectDegradationMetadata(input.element);

  return {
    url: window.location.href,
    selector,
    css_path: cssPath,
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    html_snapshot: html ? trimHtmlSnapshot(input.element, MAX_HTML_SNAPSHOT_BYTES) : null,
    screenshot_data: null,
    memo,
    tags: [...input.tags],
    mode: input.mode,
    component_name: degradation?.component_name ?? null,
    source_path: degradation?.source_path ?? null
  };
}
