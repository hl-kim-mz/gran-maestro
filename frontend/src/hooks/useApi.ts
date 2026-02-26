export async function apiFetch<T>(path: string, projectId?: string, options?: RequestInit): Promise<T> {
  // If projectId is provided, rewrite /api/... -> /api/projects/{projectId}/...
  let resolvedPath = path;
  if (projectId && path.startsWith('/api/')) {
    resolvedPath = `/api/projects/${projectId}/${path.slice('/api/'.length)}`;
  }

  const headers = new Headers(options?.headers);
  if (options?.body !== undefined && options.body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let signal = options?.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const requestInit: RequestInit = {
    ...options,
    headers,
    signal,
  };

  if (!signal) {
    const controller = new AbortController();
    signal = controller.signal;
    timeoutId = setTimeout(() => controller.abort(), 15_000);
    requestInit.signal = signal;
  }

  try {
    const response = await fetch(resolvedPath, requestInit);
    if (!response.ok) {
      throw new Error(`API ${resolvedPath} failed: ${response.status}`);
    }

    return response.json();
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
