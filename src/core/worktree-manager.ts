/**
 * Git worktree lifecycle manager for Gran Maestro.
 *
 * Handles creation, merge (rebase + squash), stale detection, and
 * cleanup of task-level git worktrees.
 *
 * @module worktree-manager
 * @see design-decisions.md section 5
 */

import { runWithTimeout } from './cli-adapter.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Lifecycle state of a single worktree.
 *
 * Follows the state diagram from design-decisions.md section 5.
 */
export type WorktreeState =
  | 'creating'
  | 'active'
  | 'stale'
  | 'pre_merge'
  | 'merged'
  | 'cleaned'
  | 'create_failed'
  | 'conflict'
  | 'clean_failed';

/** Configuration for the worktree subsystem. */
export interface WorktreeConfig {
  /** Root directory where worktrees are created. */
  root_directory: string;
  /** Maximum number of active worktrees allowed. */
  max_active: number;
  /** Branch from which worktrees are forked. */
  base_branch: string;
  /** Hours after which an unused worktree is considered stale. */
  stale_timeout_hours: number;
  /** Whether to auto-clean worktrees when a task is cancelled. */
  auto_cleanup_on_cancel: boolean;
}

/** Default worktree settings from design-decisions.md section 5. */
export const DEFAULT_WORKTREE_CONFIG: Readonly<WorktreeConfig> = {
  root_directory: '.gran-maestro/worktrees',
  max_active: 10,
  base_branch: 'main',
  stale_timeout_hours: 24,
  auto_cleanup_on_cancel: true,
} as const;

/** Metadata about a single worktree instance. */
export interface WorktreeInfo {
  /** Task identifier that owns this worktree. */
  taskId: string;
  /** Absolute path to the worktree directory. */
  path: string;
  /** Git branch name backing this worktree. */
  branch: string;
  /** Current lifecycle state. */
  state: WorktreeState;
  /** ISO 8601 timestamp of when the worktree was created. */
  created_at: string;
  /** ISO 8601 timestamp of last activity in the worktree. */
  last_activity_at: string;
}

/** Result of a merge attempt. */
export type MergeResult =
  | { status: 'success' }
  | { status: 'conflict'; details: string }
  | { status: 'error'; message: string };

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

/**
 * Manages the full lifecycle of task-level git worktrees.
 *
 * Each task gets its own worktree so that multiple tasks can execute
 * in parallel without interfering with each other.
 */
export class WorktreeManager {
  private worktrees: Map<string, WorktreeInfo> = new Map();

  constructor(
    private readonly config: WorktreeConfig = DEFAULT_WORKTREE_CONFIG,
    /** Project root (the main git repo). */
    private readonly projectRoot: string = '.',
  ) {}

  /**
   * Create a new git worktree for a task.
   *
   * @param taskId     - Task identifier (e.g. "REQ-001-01").
   * @param baseBranch - Branch to fork from (defaults to config.base_branch).
   * @returns Absolute path to the created worktree.
   * @throws {Error} If the maximum number of active worktrees is reached.
   */
  async create(taskId: string, baseBranch?: string): Promise<string> {
    const activeCount = await this.listActive();
    if (activeCount.length >= this.config.max_active) {
      throw new Error(
        `Maximum active worktrees reached (${this.config.max_active}). ` +
          'Clean up stale worktrees before creating new ones.',
      );
    }

    const branch = `gran-maestro/${taskId}`;
    const worktreePath = `${this.config.root_directory}/${taskId}`;
    const base = baseBranch ?? this.config.base_branch;

    const info: WorktreeInfo = {
      taskId,
      path: worktreePath,
      branch,
      state: 'creating',
      created_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    };
    this.worktrees.set(taskId, info);

    try {
      // Ensure the root directory exists
      // Node.js fallback: fs.promises.mkdir
      try {
        await Deno.mkdir(this.config.root_directory, { recursive: true });
      } catch {
        // May already exist
      }

      const cmd = `git worktree add -b "${branch}" "${worktreePath}" "${base}"`;
      const result = await runWithTimeout(cmd, this.projectRoot, 30_000);

      if (!result.success) {
        info.state = 'create_failed';
        throw new Error(`Failed to create worktree: ${result.stderr}`);
      }

      info.state = 'active';
      return worktreePath;
    } catch (err) {
      info.state = 'create_failed';
      throw err;
    }
  }

  /**
   * Remove a worktree and clean up its branch.
   *
   * @param taskId - Task identifier.
   * @param force  - Pass `true` to use `--force` removal.
   */
  async remove(taskId: string, force = false): Promise<void> {
    const info = this.worktrees.get(taskId);
    const worktreePath =
      info?.path ?? `${this.config.root_directory}/${taskId}`;
    const branch = info?.branch ?? `gran-maestro/${taskId}`;

    try {
      const forceFlag = force ? ' --force' : '';
      const removeCmd = `git worktree remove${forceFlag} "${worktreePath}"`;
      await runWithTimeout(removeCmd, this.projectRoot, 30_000);

      // Clean up branch
      const branchCmd = `git branch -D "${branch}"`;
      await runWithTimeout(branchCmd, this.projectRoot, 10_000);

      if (info) {
        info.state = 'cleaned';
      }
    } catch {
      if (info) {
        info.state = 'clean_failed';
      }
    }
  }

  /**
   * Merge a task's worktree into the target branch using rebase + squash.
   *
   * @param taskId       - Task identifier.
   * @param targetBranch - Branch to merge into (usually `main`).
   * @returns A {@link MergeResult} indicating success, conflict, or error.
   */
  async merge(taskId: string, targetBranch: string): Promise<MergeResult> {
    const info = this.worktrees.get(taskId);
    const worktreePath =
      info?.path ?? `${this.config.root_directory}/${taskId}`;
    const branch = info?.branch ?? `gran-maestro/${taskId}`;

    if (info) {
      info.state = 'pre_merge';
    }

    try {
      // Step 1: rebase onto target
      const rebaseCmd = `git rebase "${targetBranch}"`;
      const rebaseResult = await runWithTimeout(rebaseCmd, worktreePath, 60_000);

      if (!rebaseResult.success) {
        // Abort rebase on conflict
        await runWithTimeout('git rebase --abort', worktreePath, 10_000);
        if (info) info.state = 'conflict';
        return { status: 'conflict', details: rebaseResult.stderr };
      }

      // Step 2: squash merge from the project root
      const mergeCmd = `git merge --squash "${branch}"`;
      const mergeResult = await runWithTimeout(mergeCmd, this.projectRoot, 60_000);

      if (!mergeResult.success) {
        if (info) info.state = 'conflict';
        return { status: 'conflict', details: mergeResult.stderr };
      }

      // Step 3: commit the squash
      const commitCmd = `git commit -m "[${taskId}] squash merge from ${branch}"`;
      const commitResult = await runWithTimeout(commitCmd, this.projectRoot, 10_000);

      if (!commitResult.success) {
        return { status: 'error', message: commitResult.stderr };
      }

      if (info) info.state = 'merged';
      return { status: 'success' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'error', message };
    }
  }

  /**
   * List all currently tracked (non-cleaned) worktrees.
   *
   * @returns Array of {@link WorktreeInfo} for active worktrees.
   */
  async listActive(): Promise<WorktreeInfo[]> {
    // Also refresh from git for worktrees we might not be tracking in memory
    try {
      const result = await runWithTimeout(
        'git worktree list --porcelain',
        this.projectRoot,
        10_000,
      );
      if (result.success) {
        // Parse porcelain output to discover worktrees we haven't tracked yet
        const lines = result.stdout.split('\n');
        for (const line of lines) {
          if (line.startsWith('worktree ') && line.includes('gran-maestro')) {
            const wtPath = line.replace('worktree ', '').trim();
            // Extract task ID from path
            const parts = wtPath.split('/');
            const taskId = parts[parts.length - 1];
            if (taskId && !this.worktrees.has(taskId)) {
              this.worktrees.set(taskId, {
                taskId,
                path: wtPath,
                branch: `gran-maestro/${taskId}`,
                state: 'active',
                created_at: new Date().toISOString(),
                last_activity_at: new Date().toISOString(),
              });
            }
          }
        }
      }
    } catch {
      // Non-critical -- fall back to in-memory tracking only
    }

    return Array.from(this.worktrees.values()).filter(
      (wt) => !['cleaned', 'create_failed', 'clean_failed'].includes(wt.state),
    );
  }

  /**
   * Detect worktrees that have been inactive longer than `timeoutHours`.
   *
   * @param timeoutHours - Inactivity threshold in hours.
   * @returns Array of stale {@link WorktreeInfo} entries.
   */
  async detectStale(timeoutHours?: number): Promise<WorktreeInfo[]> {
    const threshold = (timeoutHours ?? this.config.stale_timeout_hours) * 60 * 60 * 1_000;
    const now = Date.now();
    const active = await this.listActive();

    return active.filter((wt) => {
      const lastActivity = new Date(wt.last_activity_at).getTime();
      return now - lastActivity > threshold;
    });
  }

  /**
   * Full cleanup of a task's worktree.
   *
   * Kills any running CLI process (by convention), removes the worktree
   * and branch, and marks the internal state as cleaned.
   *
   * @param taskId - Task identifier.
   */
  async cleanup(taskId: string): Promise<void> {
    // Attempt to kill any running CLI process associated with this worktree.
    // The actual PID tracking is done by the orchestration engine; here we
    // do a best-effort pkill by working directory pattern.
    const worktreePath = `${this.config.root_directory}/${taskId}`;
    try {
      await runWithTimeout(
        `pkill -f "${worktreePath}" || true`,
        this.projectRoot,
        5_000,
      );
    } catch {
      // Non-fatal
    }

    // Remove worktree + branch
    await this.remove(taskId, true);
  }
}
