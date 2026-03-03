const LANDMARK_SELECTOR = [
  'header',
  'nav',
  'main',
  'aside',
  'footer',
  'section',
  'article',
  '[role=banner]',
  '[role=navigation]',
  '[role=main]',
  '[role=complementary]',
  '[role=contentinfo]',
  '[role=search]',
  'form',
  'button',
  'a[href]',
  'input',
  'select',
  'textarea'
].join(', ');

const MIN_OVERLAY_SIZE_PX = 10;

function isInputElementVisible(element: Element): boolean {
  if (element instanceof HTMLInputElement && element.type.toLowerCase() === 'hidden') {
    return false;
  }
  return true;
}

export function scanLandmarkElements(documentRef: Document = document): Element[] {
  const discovered = documentRef.querySelectorAll<HTMLElement>(LANDMARK_SELECTOR);
  const result: Element[] = [];
  for (const element of discovered) {
    if (!isLandmarkCandidate(element)) {
      continue;
    }
    if (!isElementLargeEnough(element)) {
      continue;
    }

    result.push(element);
  }

  return result;
}

function isLandmarkCandidate(element: Element): boolean {
  if (element.matches('a[href]')) {
    const anchor = element as HTMLAnchorElement;
    return Boolean(anchor.getAttribute('href'));
  }

  if (!isInputElementVisible(element)) {
    return false;
  }

  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  return true;
}

function isElementLargeEnough(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width >= MIN_OVERLAY_SIZE_PX && rect.height >= MIN_OVERLAY_SIZE_PX;
}
