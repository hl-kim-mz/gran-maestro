import { MESSAGE_TYPES } from '../shared/constants';
import { sendToBackground } from '../shared/messages';
import { TakeScreenshotResponse } from '../shared/types';

const MAX_BYTES = 1024 * 1024;
const MAX_QUALITY = 0.9;
const MIN_QUALITY = 0.3;
const QUALITY_STEP = 0.1;
const SCALE_STEP = 0.8;

async function loadImageFromDataUrl(imageDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('스크린샷 이미지 로드 실패'));
    image.src = imageDataUrl;
  });
}

function dataUrlByteLength(imageDataUrl: string): number {
  const base64Part = imageDataUrl.split(',')[1] ?? '';
  if (!base64Part) {
    return 0;
  }
  return Math.ceil(base64Part.length * 3 / 4);
}

async function toWebP(
  sourceImage: HTMLImageElement,
  width: number,
  height: number,
  quality: number
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('캔버스 렌더링 컨텍스트 생성 실패');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', quality);
}

function reduceQuality(quality: number): number {
  return Number(Math.max(MIN_QUALITY, quality - QUALITY_STEP).toFixed(1));
}

export async function captureScreenshotToWebP(): Promise<string | null> {
  const screenshot = await sendToBackground<TakeScreenshotResponse>({
    type: MESSAGE_TYPES.TAKE_SCREENSHOT,
    payload: {}
  });

  if (!screenshot?.ok || !screenshot.payload?.imageDataUrl) {
    console.warn(
      '[GM] Screenshot capture failed:',
      screenshot?.ok === false ? screenshot.error : 'No image data'
    );
    return null;
  }

  const sourceImage = await loadImageFromDataUrl(screenshot.payload.imageDataUrl);
  let width = sourceImage.naturalWidth || sourceImage.width || 1;
  let height = sourceImage.naturalHeight || sourceImage.height || 1;
  let quality = MAX_QUALITY;

  const MAX_ITERATIONS = 20;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const webp = await toWebP(sourceImage, width, height, quality);
    if (dataUrlByteLength(webp) <= MAX_BYTES) {
      return webp;
    }

    if (quality > MIN_QUALITY) {
      quality = reduceQuality(quality);
      continue;
    }

    if (width <= 1 && height <= 1) {
      return webp;
    }

    width = Math.max(1, Math.floor(width * SCALE_STEP));
    height = Math.max(1, Math.floor(height * SCALE_STEP));
  }

  return await toWebP(sourceImage, width, height, quality);
}
