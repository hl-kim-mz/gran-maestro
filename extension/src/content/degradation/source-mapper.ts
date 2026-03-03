const REACT_MAX_FIBER_DEPTH = 20;
const REACT_FIBER_KEY_PREFIX = '__reactFiber$';

type AnyRecord = Record<string, unknown>;

interface DebugSource {
  fileName?: string | null;
  file?: string | null;
  lineNumber?: number | null;
  line?: number | null;
}

function getRecord(value: unknown): AnyRecord | null {
  return typeof value === 'object' && value !== null ? (value as AnyRecord) : null;
}

function normalizeSource(source: unknown): string | null {
  if (typeof source === 'string') {
    const text = source.trim();
    return text || null;
  }

  const record = getRecord(source);
  if (!record) {
    return null;
  }

  const file = typeof record.fileName === 'string'
    ? record.fileName.trim()
    : typeof record.file === 'string'
      ? record.file.trim()
      : '';
  if (!file) {
    return null;
  }

  const line = typeof record.lineNumber === 'number'
    ? record.lineNumber
    : typeof record.line === 'number'
      ? record.line
      : null;
  if (typeof line === 'number' && Number.isFinite(line)) {
    return `${file}:${line}`;
  }

  return file;
}

function extractDebugSourceFromFiber(fiber: unknown): string | null {
  const record = getRecord(fiber);
  if (!record) {
    return null;
  }

  const direct = normalizeSource(record._debugSource);
  if (direct) {
    return direct;
  }

  const fromReturn = normalizeSource(record.return && (record.return as AnyRecord)._debugSource);
  if (fromReturn) {
    return fromReturn;
  }

  const fromOwner = normalizeSource(record._debugOwner && (record._debugOwner as AnyRecord)._debugSource);
  if (fromOwner) {
    return fromOwner;
  }

  return null;
}

function detectReactSourceFromFiberChain(start: unknown): string | null {
  const startRecord = getRecord(start);
  if (!startRecord) {
    return null;
  }

  let current: AnyRecord | null = startRecord;
  let depth = 0;
  while (current && depth < REACT_MAX_FIBER_DEPTH) {
    const source = extractDebugSourceFromFiber(current);
    if (source) {
      return source;
    }

    current = getRecord(current.return) ?? getRecord(current._owner);
    depth += 1;
  }

  return null;
}

function detectReactFiberNode(element: Element): unknown | null {
  const target = element as unknown as AnyRecord;
  const reactFiberKey = Object.keys(target).find((key) => key.startsWith(REACT_FIBER_KEY_PREFIX));
  if (reactFiberKey && target[reactFiberKey] != null) {
    return target[reactFiberKey];
  }

  return target._reactInternals ?? target._reactInternalInstance ?? null;
}

function detectSourceFromDomAttributes(element: Element): string | null {
  const node = element.closest('[data-source-file]');
  if (!node) {
    return null;
  }
  const file = node.getAttribute('data-source-file');
  if (!file) {
    return null;
  }

  const line = node.getAttribute('data-source-line');
  if (!line) {
    return file;
  }

  const parsedLine = Number(line);
  if (Number.isInteger(parsedLine) && parsedLine > 0) {
    return `${file}:${parsedLine}`;
  }

  return file;
}

function isFunctionSource(value: unknown): string | null {
  if (typeof value !== 'function') {
    return null;
  }

  const text = value.toString();
  const match = text.match(/\/\*\s*#\s*sourceMappingURL=(.+)\s*\*\//) ??
    text.match(/\/\/\#\s*sourceMappingURL=(.+)/);
  if (match?.[1]) {
    const file = match[1].trim();
    if (file) {
      return file;
    }
  }

  const alt = text.match(/\/\/\# sourceURL=(.+)/i);
  if (alt?.[1]) {
    return alt[1].trim();
  }

  return null;
}

function detectSourceFromWebpackModules(): string | null {
  const webpackModules = (globalThis as unknown as Record<string, unknown>).__webpack_modules__;
  if (!webpackModules || typeof webpackModules !== 'object') {
    return null;
  }

  const entries = Object.entries(webpackModules as Record<string, unknown>);
  for (let index = 0; index < entries.length && index < 200; index += 1) {
    const [, moduleExport] = entries[index];
    if (!moduleExport) {
      continue;
    }

    const source = normalizeSource(moduleExport)
      ?? normalizeSource((moduleExport as AnyRecord).__source)
      ?? normalizeSource((moduleExport as AnyRecord).source)
      ?? isFunctionSource(moduleExport);
    if (source) {
      return source;
    }
  }

  return null;
}

function detectSourceFromDevTools(element: Element, fiber: unknown): string | null {
  const hook = (globalThis as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ as AnyRecord | undefined;
  if (!hook || typeof hook !== 'object') {
    return null;
  }

  const renderers = hook.renderers;
  if (!renderers) {
    return null;
  }

  const rendererEntries: Array<[unknown, unknown]> = Array.isArray(renderers)
    ? renderers.map((value, index) => [index, value])
    : renderers instanceof Map
      ? Array.from(renderers.entries())
      : [];

  for (const [rendererId, renderer] of rendererEntries) {
    const rendererRecord = getRecord(renderer);
    if (!rendererRecord) {
      continue;
    }

    const getFiberRoots = rendererRecord.getFiberRoots;
    if (typeof getFiberRoots === 'function') {
      const roots = getFiberRoots.call(renderer, rendererId) as unknown;
      const rootSet = roots instanceof Set ? roots : null;
      if (!rootSet) {
        continue;
      }

      for (const root of rootSet) {
        const rootRecord = getRecord(root);
        const rootFiber = rootRecord?.current;
        const found = detectSourceFromFiberTree(rootFiber, element);
        if (found) {
          return found;
        }
      }
    }

    const source = rendererRecord.findFiberByHostInstance
      ? extractDebugSourceFromFiber((rendererRecord.findFiberByHostInstance as (target: unknown) => unknown)(fiber))
      : null;
    if (source) {
      return source;
    }
  }

  return null;
}

function detectSourceFromFiberTree(rootFiber: unknown, target: Element): string | null {
  const root = getRecord(rootFiber);
  if (!root) {
    return null;
  }

  const stack: unknown[] = [root];
  const visited = new Set<unknown>();
  let checked = 0;
  const LIMIT = 500;

  while (stack.length && checked < LIMIT) {
    const current = stack.pop();
    checked += 1;
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);

    const currentRecord = getRecord(current);
    if (!currentRecord) {
      continue;
    }

    if (currentRecord.stateNode === target) {
      const source = extractDebugSourceFromFiber(currentRecord);
      if (source) {
        return source;
      }
    }

    if (currentRecord.child) {
      stack.push(currentRecord.child);
    }
    if (currentRecord.sibling) {
      stack.push(currentRecord.sibling);
    }
    if (currentRecord.return) {
      stack.push(currentRecord.return);
    }
  }

  return null;
}

export function detectSourcePath(element: Element): string | null {
  try {
    const reactFiber = detectReactFiberNode(element);
    const sourceFromFiber = detectReactSourceFromFiberChain(reactFiber);
    if (sourceFromFiber) {
      return sourceFromFiber;
    }

    const domSource = detectSourceFromDomAttributes(element);
    if (domSource) {
      return domSource;
    }

    const sourceFromDevTools = detectSourceFromDevTools(element, reactFiber);
    if (sourceFromDevTools) {
      return sourceFromDevTools;
    }

    const sourceFromWebpack = detectSourceFromWebpackModules();
    if (sourceFromWebpack) {
      return sourceFromWebpack;
    }

    return null;
  } catch {
    return null;
  }
}
