import { useState } from 'react';

export function useAuth() {
  const [projectId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      sessionStorage.setItem('gm_token', urlToken);
    }

    const urlProject = params.get('project');
    if (urlProject) {
      sessionStorage.setItem('gm_project', urlProject);
    }

    if (urlToken || urlProject) {
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }

    if (urlProject) {
      return urlProject;
    }
    return sessionStorage.getItem('gm_project') || '';
  });

  return { projectId };
}
