/**
 * Task-level finite state machine for Gran Maestro.
 *
 * Defines the dual-layer state model:
 *   - **TaskStatus** -- per-task FSM (status.json)
 *   - **RequestPhase** -- per-request derived phase (request.json)
 *
 * All valid transitions are encoded declaratively so the engine can
 * enforce invariants at runtime.
 *
 * @module task-fsm
 * @see design-decisions.md section 2
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * All possible states a single task can be in.
 *
 * Follows the extended status enum from design-decisions.md section 2.
 */
export type TaskStatus =
  | 'pending'            // Created in Phase 1, awaiting execution
  | 'queued'             // Entered the execution queue (respects max_parallel_tasks)
  | 'executing'          // Phase 2: CLI is running
  | 'pre_check'          // Phase 2: pre-verification (typecheck / tests)
  | 'pre_check_failed'   // Phase 2: pre-verification failed
  | 'review'             // Phase 3: PM review in progress
  | 'feedback'           // Phase 4: feedback written, awaiting re-execution
  | 'merging'            // Phase 5: rebase + merge in progress
  | 'merge_conflict'     // Phase 5: merge conflict detected
  | 'done'               // Completed (merged)
  | 'failed'             // System error
  | 'cancelled';         // User cancelled

/**
 * Derived request-level phase computed from the statuses of all child tasks.
 */
export type RequestPhase =
  | 'phase1_analysis'
  | 'phase2_execution'
  | 'phase3_review'
  | 'phase4_feedback'
  | 'phase5_acceptance'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'unknown';

/** A single permitted state transition with optional condition / guard descriptions. */
export interface TaskTransition {
  /** Source status. Use `'*'` for "any non-terminal state". */
  from: TaskStatus | '*';
  /** Target status. */
  to: TaskStatus;
  /** Human-readable condition that must be true for this transition. */
  condition: string;
  /** Optional guard expression evaluated at runtime. */
  guard?: string;
}

/** Runtime state of a single task. */
export interface TaskState {
  /** Unique task identifier, e.g. "REQ-001-01". */
  id: string;
  /** Current FSM status. */
  status: TaskStatus;
  /** Number of times this task has been retried. */
  retry_count: number;
  /** Current feedback round (0 = initial). */
  feedback_round: number;
  /** Agent key assigned to this task (e.g. "codex-dev"). */
  assigned_agent: string;
  /** Absolute path to the task's git worktree. */
  worktree_path: string;
  /** ISO 8601 creation timestamp. */
  created_at: string;
  /** ISO 8601 last-update timestamp. */
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Transition table
// ---------------------------------------------------------------------------

/** Terminal statuses -- no outgoing transitions except to themselves. */
const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'done',
  'failed',
  'cancelled',
]);

/**
 * Declarative table of every valid state transition.
 *
 * Derived from design-decisions.md lines 153-167.
 */
export const VALID_TRANSITIONS: readonly TaskTransition[] = [
  // Phase 1 -> Queue
  {
    from: 'pending',
    to: 'queued',
    condition: 'PM decides execution order',
    guard: 'no pending predecessors or predecessors completed',
  },
  // Queue -> Execute
  {
    from: 'queued',
    to: 'executing',
    condition: 'Parallel slot available',
    guard: 'active_tasks < max_parallel_tasks',
  },
  // Execute -> Pre-check (success)
  {
    from: 'executing',
    to: 'pre_check',
    condition: 'CLI exit code === 0',
    guard: 'commit exists in worktree',
  },
  // Execute -> Failed (retries exhausted)
  {
    from: 'executing',
    to: 'failed',
    condition: 'CLI exit code !== 0 and retries exhausted',
    guard: 'retry_count >= max_retries',
  },
  // Pre-check -> Review (pass)
  {
    from: 'pre_check',
    to: 'review',
    condition: 'Typecheck + tests pass',
  },
  // Pre-check -> Pre-check failed
  {
    from: 'pre_check',
    to: 'pre_check_failed',
    condition: 'Typecheck or tests fail',
  },
  // Pre-check failed -> Re-execute (auto retry)
  {
    from: 'pre_check_failed',
    to: 'executing',
    condition: 'Auto retry with feedback attached',
    guard: 'retry_count < max_retries',
  },
  // Pre-check failed -> Feedback (retries exhausted)
  {
    from: 'pre_check_failed',
    to: 'feedback',
    condition: 'Retries exhausted',
    guard: 'retry_count >= max_retries',
  },
  // Review -> Done (PASS)
  {
    from: 'review',
    to: 'done',
    condition: 'PASS verdict -- all acceptance criteria met',
  },
  // Review -> Feedback (FAIL / PARTIAL)
  {
    from: 'review',
    to: 'feedback',
    condition: 'FAIL or PARTIAL verdict',
  },
  // Feedback -> Re-execute (implementation error)
  {
    from: 'feedback',
    to: 'executing',
    condition: 'Root cause classified as implementation error',
  },
  // Feedback -> Pending (spec insufficient -- re-enter Phase 1)
  {
    from: 'feedback',
    to: 'pending',
    condition: 'Root cause classified as insufficient spec',
  },
  // Merging -> Done (merge success)
  {
    from: 'merging',
    to: 'done',
    condition: 'Merge succeeded',
  },
  // Merging -> Merge conflict
  {
    from: 'merging',
    to: 'merge_conflict',
    condition: 'Merge conflict detected',
  },
  // Review -> Merging (direct merge path)
  {
    from: 'review',
    to: 'merging',
    condition: 'PASS verdict -- proceed to merge',
  },
  // Any non-terminal -> Cancelled (/mc)
  {
    from: '*',
    to: 'cancelled',
    condition: '/mc invoked',
    guard: 'CLI process receives SIGTERM',
  },
  // Any non-terminal -> Failed (system error)
  {
    from: '*',
    to: 'failed',
    condition: 'Unrecoverable system error',
  },
] as const;

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

/**
 * Check whether transitioning from `from` to `to` is valid according to
 * the declared transition table.
 *
 * @param from - Current task status.
 * @param to   - Desired target status.
 * @returns `true` if a matching transition rule exists.
 */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (TERMINAL_STATUSES.has(from)) {
    return false;
  }
  return VALID_TRANSITIONS.some(
    (t) => (t.from === from || t.from === '*') && t.to === to,
  );
}

/**
 * Validate and apply a status transition to a task.
 *
 * Returns a **new** {@link TaskState} object (immutable update) with the
 * status and `updated_at` fields changed.
 *
 * @param task - The current task state.
 * @param to   - The desired target status.
 * @returns A new task state with the transition applied.
 * @throws {Error} If the transition is not valid.
 */
export function transitionTask(task: TaskState, to: TaskStatus): TaskState {
  if (!canTransition(task.status, to)) {
    throw new Error(
      `Invalid transition: ${task.status} -> ${to} for task ${task.id}`,
    );
  }
  return {
    ...task,
    status: to,
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Request-phase computation
// ---------------------------------------------------------------------------

/**
 * Derive the overall request phase from the statuses of all its child tasks.
 *
 * The phase reflects the *most-behind* task so the PM knows where
 * attention is needed.
 *
 * @param tasks - Array of task states belonging to the same request.
 * @returns The computed {@link RequestPhase}.
 */
export function computeRequestPhase(tasks: TaskState[]): RequestPhase {
  if (tasks.length === 0) return 'unknown';

  if (tasks.every((t) => t.status === 'done')) return 'completed';
  if (tasks.every((t) => t.status === 'cancelled')) return 'cancelled';
  if (tasks.some((t) => t.status === 'failed')) return 'failed';

  // Determine phase from the most-behind task
  if (tasks.some((t) => t.status === 'pending')) return 'phase1_analysis';
  if (
    tasks.some((t) =>
      ['queued', 'executing', 'pre_check', 'pre_check_failed'].includes(
        t.status,
      ),
    )
  )
    return 'phase2_execution';
  if (tasks.some((t) => t.status === 'review')) return 'phase3_review';
  if (tasks.some((t) => t.status === 'feedback')) return 'phase4_feedback';
  if (tasks.some((t) => ['merging', 'merge_conflict'].includes(t.status)))
    return 'phase5_acceptance';

  return 'unknown';
}
