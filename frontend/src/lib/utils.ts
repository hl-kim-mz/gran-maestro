import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function deepSet(obj: any, path: string[], value: any): any {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  return { ...obj, [head]: deepSet(obj?.[head] ?? {}, rest, value) };
}
