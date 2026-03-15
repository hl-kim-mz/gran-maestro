import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function deepSet(obj: any, path: string[], value: any): any {
  if (path.length === 0) return value;
  const [head, ...rest] = path;

  if (Array.isArray(obj)) {
    const index = Number(head);
    const clone = [...obj];
    clone[index] = deepSet(clone[index], rest, value);
    return clone;
  }

  return { ...obj, [head]: deepSet(obj?.[head] ?? {}, rest, value) };
}

export function getNestedValue(obj: any, path: string[]): any {
  let current = obj;

  for (const key of path) {
    if (
      current === undefined ||
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current)
    ) {
      return undefined;
    }

    if (!(key in current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

export function deepRemove(obj: any, path: string[]): any {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || path.length === 0) {
    return obj;
  }

  const [head, ...rest] = path;
  if (!(head in obj)) return obj;

  const clone = { ...obj };
  if (rest.length === 0) {
    delete clone[head];
  } else {
    clone[head] = deepRemove(obj[head], rest);
    if (clone[head] && typeof clone[head] === 'object' && !Array.isArray(clone[head]) && Object.keys(clone[head]).length === 0) {
      delete clone[head];
    }
  }

  return clone;
}
