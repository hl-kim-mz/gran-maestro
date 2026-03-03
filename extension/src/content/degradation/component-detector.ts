const REACT_MAX_FIBER_DEPTH = 20;
const REACT_FIBER_KEY_PREFIX = '__reactFiber$';

type AnyRecord = Record<string, unknown>;

function getRecord(value: unknown): AnyRecord | null {
  return typeof value === 'object' && value !== null ? (value as AnyRecord) : null;
}

function findReactFiberNode(element: Element): unknown | null {
  const target = element as unknown as AnyRecord;
  const reactFiberKey = Object.keys(target).find((key) => key.startsWith(REACT_FIBER_KEY_PREFIX));
  if (reactFiberKey && target[reactFiberKey] != null) {
    return target[reactFiberKey];
  }

  return target._reactInternals ?? target._reactInternalInstance ?? null;
}

function normalizeName(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  const record = getRecord(value);
  if (!record) {
    return null;
  }

  const candidate = record.displayName ?? record.name ?? record.__name ?? record.typeName;
  if (typeof candidate === 'string') {
    const name = candidate.trim();
    if (name) {
      return name;
    }
  }
  return null;
}

function detectNameFromType(type: unknown): string | null {
  const record = getRecord(type);
  if (!record) {
    return null;
  }

  const directName = normalizeName(record.type ?? record.elementType ?? record.innerType ?? record.renderedElement);
  if (directName) {
    return directName;
  }

  if (record.type && typeof record.type === 'object') {
    const typeRecord = getRecord(record.type);
    const nested = normalizeName(typeRecord?.displayName)
      ?? normalizeName(typeRecord?.type)
      ?? normalizeName(typeRecord?.name);
    if (nested) {
      return nested;
    }
  }

  if (record.render && typeof record.render === 'object') {
    const renderName = normalizeName((record.render as AnyRecord).displayName)
      ?? normalizeName((record.render as AnyRecord).name);
    if (renderName) {
      return renderName;
    }
  }

  return null;
}

function detectNameFromReactFiber(fiber: unknown): string | null {
  const start = getRecord(fiber);
  if (!start) {
    return null;
  }

  let current: AnyRecord | null = start;
  let depth = 0;
  while (current && depth < REACT_MAX_FIBER_DEPTH) {
    const type = current.type ?? current.elementType;
    const byType = detectNameFromType(type);
    if (byType) {
      return byType;
    }

    const byElement = normalizeName((current.elementType as AnyRecord)?.__displayName);
    if (byElement) {
      return byElement;
    }

    const byStateNode = normalizeName(current.stateNode && (current.stateNode as AnyRecord).constructor?.name);
    if (byStateNode) {
      return byStateNode;
    }

    current = getRecord(current.return) ?? getRecord(current._owner);
    depth += 1;
  }

  return null;
}

function detectVueFromParentComponent(element: Element): string | null {
  const parentComponent = (element as Element & { __vueParentComponent?: unknown }).__vueParentComponent;
  if (!parentComponent || typeof parentComponent !== 'object') {
    return null;
  }

  const parentRecord = parentComponent as AnyRecord;
  const parentType = parentRecord.type;
  const direct = normalizeName(parentType);
  if (direct) {
    return direct;
  }
  const namedType = normalizeName((parentType as AnyRecord)?.name)
    ?? normalizeName((parentType as AnyRecord)?.__name)
    ?? normalizeName((parentType as AnyRecord)?.__file);
  if (namedType) {
    return namedType;
  }

  const parentTypeRecord = getRecord(parentRecord.type);
  const fromOptions = normalizeName(parentTypeRecord?.name)
    ?? normalizeName(parentTypeRecord?.__name)
    ?? normalizeName(parentTypeRecord?.options && getRecord(parentTypeRecord.options)?.name)
    ?? normalizeName(parentTypeRecord?.options && getRecord(parentTypeRecord.options)?.__file);
  if (fromOptions) {
    return fromOptions;
  }

  return null;
}

function detectVueFromInstance(element: Element): string | null {
  const vueInstance = (element as Element & { __vue__?: unknown }).__vue__;
  if (!vueInstance || typeof vueInstance !== 'object') {
    return null;
  }

  const vueRecord = vueInstance as AnyRecord;
  const vueOptions = getRecord(vueRecord.$options);
  const byOptions = normalizeName(vueOptions?.name)
    ?? normalizeName(vueOptions?.__file)
    ?? normalizeName(vueOptions?.componentName);
  if (byOptions) {
    return byOptions;
  }

  return normalizeName(vueRecord._name) ?? normalizeName(vueOptions?.__name);
}

export function detectComponentName(element: Element): string | null {
  try {
    const reactFiber = findReactFiberNode(element);
    if (reactFiber) {
      const reactName = detectNameFromReactFiber(reactFiber);
      if (reactName) {
        return reactName;
      }
    }

    const vueName = detectVueFromParentComponent(element) ?? detectVueFromInstance(element);
    if (vueName) {
      return vueName;
    }

    if (element.tagName.includes('-')) {
      return element.tagName.toLowerCase();
    }

    return null;
  } catch {
    return null;
  }
}
