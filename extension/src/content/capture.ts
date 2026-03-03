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

function trimText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
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
    html_snapshot: html ? trimText(html, MAX_HTML_SNAPSHOT_BYTES) : null,
    screenshot_data: null,
    memo,
    tags: [...input.tags],
    mode: input.mode,
    component_name: degradation?.component_name ?? null,
    source_path: degradation?.source_path ?? null
  };
}
