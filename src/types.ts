/**
 * Gran Maestro Dashboard Types
 */

export interface GranMaestroConfig {
  dashboard_port?: number;
  dashboard_auth?: boolean;
  [key: string]: unknown;
}

export interface RequestMeta {
  id: string;
  title?: string;
  status?: string;
  phase?: number;
  blockedBy?: string[];
  createdAt?: string;
  linked_plan?: string | null;
  [key: string]: unknown;
}

export interface PlanMeta {
  id: string;
  title?: string;
  status?: string;
  created_at?: string;
  linked_requests?: string[];
  content?: string | null;
  [key: string]: unknown;
}

export interface DebugMeta {
  id: string;
  issue?: string;
  focus?: string;
  status?: string;
  created_at?: string;
  content?: string | null;
  [key: string]: unknown;
}

export interface ExploreMeta {
  id: string;
  goal?: string;
  focus?: string;
  status?: string;
  created_at?: string;
  content?: string | null;
  [key: string]: unknown;
}

export interface SessionParticipant {
  key: string;
  role?: string;
  perspective?: string;
  type?: string;
  status?: string;
  provider?: string;
}

export interface TaskMeta {
  id: string;
  requestId: string;
  status?: string;
  agent?: string;
  [key: string]: unknown;
}

export interface SSEEvent {
  type: string;
  requestId?: string;
  taskId?: string;
  sessionId?: string;
  planId?: string;
  projectId?: string;
  data: unknown;
}

export interface IdeationSession {
  id: string;
  topic: string;
  focus?: string;
  status: string;
  created_at?: string;
  opinions?: Record<string, { status: string }>;
  participants?: SessionParticipant[];
  roles?: Record<
    string,
    { perspective: string; type: string; status: string; provider?: string }
  >;
  participant_config?: Record<string, number>;
  critics?: Record<string, { status: string; provider?: string }>;
  critic_count?: number;
  [key: string]: unknown;
}

export interface DiscussionSession {
  id: string;
  topic: string;
  source_ideation?: string;
  focus?: string;
  status: string;
  max_rounds: number;
  current_round: number;
  created_at?: string;
  participants?: SessionParticipant[];
  roles?: Record<
    string,
    { perspective: string; type: string; status: string; provider?: string }
  >;
  rounds?: Array<{
    round: number;
    divergences_before: number;
    divergences_after: number;
    status: string;
    responses?: Record<string, string | null>;
    critiques?: Record<string, string | null>;
  }>;
  critics?: Record<string, { status: string; provider?: string }>;
  [key: string]: unknown;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  registered_at: string;
}

export interface Registry {
  projects: Project[];
}
