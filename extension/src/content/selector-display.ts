export interface SelectorDisplay {
  selector: string;
  cssPath: string;
}

function isUniqueSelector(selector: string, target: Element): boolean {
  try {
    const matches = target.ownerDocument.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === target;
  } catch {
    return false;
  }
}

function getNthOfTypeIndex(element: Element): number {
  if (!element.parentElement) {
    return 1;
  }

  const tagName = element.tagName.toLowerCase();
  const siblings = Array.from(element.parentElement.children).filter((item) => item.tagName.toLowerCase() === tagName);

  return siblings.indexOf(element) + 1;
}

export function getUniqueSelector(element: Element): string {
  const tagName = element.tagName.toLowerCase();

  if (element.id) {
    const byId = `#${CSS.escape(element.id)}`;
    if (isUniqueSelector(byId, element)) {
      return byId;
    }
  }

  const classes = Array.from(element.classList)
    .map((className) => className.trim())
    .filter(Boolean)
    .map((className) => `.${CSS.escape(className)}`);

  if (classes.length > 0) {
    const byClass = `${tagName}${classes.join('')}`;
    if (isUniqueSelector(byClass, element)) {
      return byClass;
    }

    const withNth = `${byClass}:nth-of-type(${getNthOfTypeIndex(element)})`;
    if (isUniqueSelector(withNth, element)) {
      return withNth;
    }
  }

  const defaultSelector = `${tagName}:nth-of-type(${getNthOfTypeIndex(element)})`;
  if (isUniqueSelector(defaultSelector, element)) {
    return defaultSelector;
  }

  return defaultSelector;
}

function formatTagName(element: Element): string {
  const normalized = element.tagName.toLowerCase();
  return normalized[0] ? normalized[0].toUpperCase() + normalized.slice(1) : normalized;
}

export function getCSSPath(element: Element): string {
  const pathParts: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < 5) {
    pathParts.unshift(formatTagName(current));
    current = current.parentElement;
    depth += 1;
  }

  return pathParts.join(' > ');
}
