import { detectComponentName } from './component-detector';
import { detectSourcePath } from './source-mapper';

export interface DegradationMetadata {
  component_name: string | null;
  source_path: string | null;
}

export function collectDegradationMetadata(element: Element): DegradationMetadata | null {
  try {
    const component_name = detectComponentName(element);
    const source_path = detectSourcePath(element);

    if (component_name === null && source_path === null) {
      return null;
    }

    return { component_name, source_path };
  } catch {
    return null;
  }
}
