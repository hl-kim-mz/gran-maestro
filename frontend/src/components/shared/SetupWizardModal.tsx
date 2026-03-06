import React, { useEffect, useState } from 'react';
import {
  Bot,
  Brain,
  ClipboardCheck,
  Code2,
  Cpu,
  Gauge,
  PiggyBank,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { apiFetch } from '@/hooks/useApi';
import { cn, deepSet, getNestedValue } from '@/lib/utils';
import type { PresetMeta, PresetDiffChange } from '../../../../src/types';

type WizardStep = 1 | 2 | 3 | 4;
type AgentSelection = 'claude' | 'claude-codex' | 'claude-gemini' | 'full-team';
type TierSelection = 'performance' | 'efficient' | 'budget';

type ToolToggles = {
  stitch: boolean;
  codeReview: boolean;
  planReview: boolean;
};

type SetupWizardModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onApplied: () => void;
};

type ConfigResponse = {
  merged: Record<string, unknown>;
};

type PresetResponse = {
  builtin: PresetMeta[];
};

const STEP_LABELS = ['에이전트', '성향', '도구', '리뷰'] as const;

const AGENT_OPTIONS: Array<{
  id: AgentSelection;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'claude',
    title: 'Claude Only',
    description: 'Claude 단독으로 단순하고 안정적인 구성을 사용합니다.',
    icon: Bot,
  },
  {
    id: 'claude-codex',
    title: 'Claude + Codex',
    description: 'Claude 기반에 Codex를 더해 구현 생산성을 높입니다.',
    icon: Brain,
  },
  {
    id: 'claude-gemini',
    title: 'Claude + Gemini',
    description: 'Claude 기반에 Gemini를 더해 다양한 관점을 확보합니다.',
    icon: Sparkles,
  },
  {
    id: 'full-team',
    title: 'Full Team',
    description: 'Claude + Codex + Gemini 전체 팀 구성으로 운영합니다.',
    icon: Users,
  },
];

const TIER_OPTIONS: Array<{
  id: TierSelection;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'performance',
    title: '성능 (Performance)',
    description: '최고 성능 기준으로 모델과 에이전트를 구성합니다.',
    icon: Gauge,
  },
  {
    id: 'efficient',
    title: '효율 (Efficient)',
    description: '성능과 비용의 균형을 맞춘 기본 구성을 사용합니다.',
    icon: Cpu,
  },
  {
    id: 'budget',
    title: '절약 (Budget)',
    description: '비용 절약 중심으로 경량 구성을 사용합니다.',
    icon: PiggyBank,
  },
];

const INITIAL_TOGGLES: ToolToggles = {
  stitch: false,
  codeReview: false,
  planReview: false,
};

function resolvePresetId(
  selectedAgent: AgentSelection,
  selectedTier: TierSelection,
  builtinPresets: PresetMeta[],
): string | null {
  const matchedPreset = builtinPresets.find(
    (preset) => preset.wizardCategory === selectedAgent && preset.tier === selectedTier,
  );
  return matchedPreset?.id ?? null;
}

export function SetupWizardModal({ open, onOpenChange, projectId, onApplied }: SetupWizardModalProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedAgent, setSelectedAgent] = useState<AgentSelection | null>(null);
  const [selectedTier, setSelectedTier] = useState<TierSelection | null>(null);
  const [toolToggles, setToolToggles] = useState<ToolToggles>(INITIAL_TOGGLES);
  const [initialToggles, setInitialToggles] = useState<ToolToggles>(INITIAL_TOGGLES);
  const [builtinPresets, setBuiltinPresets] = useState<PresetMeta[]>([]);
  const [initializing, setInitializing] = useState(false);
  const [applying, setApplying] = useState(false);

  const [diffChanges, setDiffChanges] = useState<PresetDiffChange[]>([]);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !projectId) return;

    let isMounted = true;

    const initializeWizard = async () => {
      setStep(1);
      setSelectedAgent(null);
      setSelectedTier(null);
      setBuiltinPresets([]);
      setToolToggles(INITIAL_TOGGLES);
      setInitialToggles(INITIAL_TOGGLES);
      setDiffChanges([]);
      setDiffError(null);
      setInitializing(true);

      try {
        const [configResponse, presetResponse] = await Promise.all([
          apiFetch<ConfigResponse>('/api/config', projectId),
          apiFetch<PresetResponse>('/api/presets', projectId),
        ]);

        if (!isMounted) return;

        const mergedConfig = configResponse.merged ?? {};
        const loadedToggles = {
          stitch: Boolean(getNestedValue(mergedConfig, ['stitch', 'enabled'])),
          codeReview: Boolean(getNestedValue(mergedConfig, ['code_review', 'enabled'])),
          planReview: Boolean(getNestedValue(mergedConfig, ['plan_review', 'enabled'])),
        };
        setToolToggles(loadedToggles);
        setInitialToggles(loadedToggles);
        setBuiltinPresets(Array.isArray(presetResponse.builtin) ? presetResponse.builtin : []);
      } catch (err) {
        if (!isMounted) return;
        alert(`Failed to initialize setup wizard: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (isMounted) {
          setInitializing(false);
        }
      }
    };

    void initializeWizard();

    return () => {
      isMounted = false;
    };
  }, [open, projectId]);

  const canGoBack = step > 1;
  const canGoNext = (step === 1 && !!selectedAgent) || (step === 2 && !!selectedTier) || step === 3;
  const canApply = step === 4 && !!selectedAgent && !!selectedTier && !initializing && !applying && !diffError && !loadingDiff;

  const fetchDiff = async () => {
    if (!projectId || !selectedAgent || !selectedTier) return;
    const presetId = resolvePresetId(selectedAgent, selectedTier, builtinPresets);
    if (!presetId) {
      setDiffError('프리셋을 찾을 수 없습니다.');
      return;
    }

    setLoadingDiff(true);
    setDiffError(null);
    try {
      const diffResponse = await apiFetch<{ changes: PresetDiffChange[] }>(
        `/api/presets/${presetId}/diff`,
        projectId,
        { method: 'POST' }
      );

      const serverChanges = diffResponse.changes || [];
      const toolChanges: PresetDiffChange[] = [];

      if (initialToggles.stitch !== toolToggles.stitch) {
        toolChanges.push({ path: 'stitch.enabled', from: initialToggles.stitch, to: toolToggles.stitch });
      }
      if (initialToggles.codeReview !== toolToggles.codeReview) {
        toolChanges.push({ path: 'code_review.enabled', from: initialToggles.codeReview, to: toolToggles.codeReview });
      }
      if (initialToggles.planReview !== toolToggles.planReview) {
        toolChanges.push({ path: 'plan_review.enabled', from: initialToggles.planReview, to: toolToggles.planReview });
      }

      const toolPaths = new Set(toolChanges.map((c) => c.path));
      const filteredServerChanges = serverChanges.filter((c) => !toolPaths.has(c.path));
      const mergedChanges = [...filteredServerChanges, ...toolChanges];

      setDiffChanges(mergedChanges);
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingDiff(false);
    }
  };

  const handleNext = () => {
    if (step === 1 && selectedAgent) {
      setStep(2);
      return;
    }
    if (step === 2 && selectedTier) {
      setStep(3);
      return;
    }
    if (step === 3) {
      setStep(4);
      setDiffChanges([]);
      void fetchDiff();
      return;
    }
  };

  const handleBack = () => {
    if (step === 4) {
      setStep(3);
      return;
    }
    if (step === 3) {
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(1);
    }
  };

  const handleApply = async () => {
    if (!projectId || !selectedAgent || !selectedTier) return;

    const presetId = resolvePresetId(selectedAgent, selectedTier, builtinPresets);
    if (!presetId) {
      alert('프리셋을 찾을 수 없습니다');
      return;
    }
    setApplying(true);

    try {
      try {
        await apiFetch(`/api/presets/${presetId}/apply`, projectId, { method: 'POST' });
      } catch (err) {
        alert(`Failed to apply preset: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      try {
        const configResponse = await apiFetch<ConfigResponse>('/api/config', projectId);
        let nextConfig: Record<string, unknown> = configResponse.merged ?? {};
        nextConfig = deepSet(nextConfig, ['stitch', 'enabled'], toolToggles.stitch);
        nextConfig = deepSet(nextConfig, ['code_review', 'enabled'], toolToggles.codeReview);
        nextConfig = deepSet(nextConfig, ['plan_review', 'enabled'], toolToggles.planReview);

        await apiFetch('/api/config', projectId, {
          method: 'PUT',
          body: JSON.stringify(nextConfig),
        });
      } catch (_err) {
        alert('프리셋은 적용되었으나 도구 설정 적용에 실패했습니다');
        return;
      }

      onOpenChange(false);
      onApplied();
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !applying && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden gap-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="px-6 py-5 border-b bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800 shrink-0">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Wrench className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            설정 마법사
          </DialogTitle>
          <DialogDescription>
            4단계로 에이전트 조합, 성향, 도구 설정을 한 번에 적용합니다.
          </DialogDescription>
          <div className="flex items-center gap-2 pt-3">
            {STEP_LABELS.map((label, index) => {
              const stepNumber = (index + 1) as WizardStep;
              const isCurrent = step === stepNumber;
              const isCompleted = step > stepNumber;

              return (
                <React.Fragment key={label}>
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border transition-colors',
                        isCurrent && 'bg-amber-500 border-amber-500 text-white',
                        isCompleted && 'bg-emerald-500 border-emerald-500 text-white',
                        !isCurrent && !isCompleted && 'bg-background border-muted-foreground/30 text-muted-foreground',
                      )}
                    >
                      {stepNumber}
                    </div>
                    <span
                      className={cn(
                        'text-sm',
                        isCurrent ? 'text-foreground font-semibold' : 'text-muted-foreground',
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  {index < STEP_LABELS.length - 1 && (
                    <div className={cn('h-px flex-1', step > stepNumber ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </DialogHeader>

        <div className="px-6 py-6 min-h-[360px] overflow-y-auto">
          {initializing ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground animate-pulse">
              현재 설정을 불러오는 중...
            </div>
          ) : (
            <>
              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">원하는 에이전트 조합을 선택하세요.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {AGENT_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const selected = selectedAgent === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedAgent(option.id);
                            setSelectedTier(null);
                          }}
                          className={cn(
                            'rounded-2xl border p-4 text-left transition-colors',
                            'focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2',
                            'hover:border-amber-400 hover:bg-amber-50/60 dark:hover:bg-zinc-800',
                            selected
                              ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
                              : 'border-border bg-card',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 p-2">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="space-y-1">
                              <div className="font-semibold text-sm">{option.title}</div>
                              <p className="text-xs text-muted-foreground">{option.description}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">작업 성향을 선택하세요.</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {TIER_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const selected = selectedTier === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSelectedTier(option.id)}
                          className={cn(
                            'rounded-2xl border p-4 text-left transition-colors',
                            'focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2',
                            'hover:border-orange-400 hover:bg-orange-50/60 dark:hover:bg-zinc-800',
                            selected
                              ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30'
                              : 'border-border bg-card',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 p-2">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="space-y-1">
                              <div className="font-semibold text-sm">{option.title}</div>
                              <p className="text-xs text-muted-foreground">{option.description}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">원하는 도구만 켜서 세부 동작을 맞춤화하세요.</p>
                  <div className="space-y-3">
                    <div className="rounded-xl border bg-card p-4 flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          Stitch
                        </div>
                        <p className="text-xs text-muted-foreground">UI 설계/캡처 기반 워크플로우를 활성화합니다.</p>
                      </div>
                      <Switch
                        aria-label="Stitch"
                        checked={toolToggles.stitch}
                        onCheckedChange={(checked) => setToolToggles((prev) => ({ ...prev, stitch: checked }))}
                      />
                    </div>

                    <div className="rounded-xl border bg-card p-4 flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Code2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          Code Review
                        </div>
                        <p className="text-xs text-muted-foreground">구현 완료 후 코드 리뷰 단계를 활성화합니다.</p>
                      </div>
                      <Switch
                        aria-label="Code Review"
                        checked={toolToggles.codeReview}
                        onCheckedChange={(checked) => setToolToggles((prev) => ({ ...prev, codeReview: checked }))}
                      />
                    </div>

                    <div className="rounded-xl border bg-card p-4 flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <ClipboardCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          Plan Review
                        </div>
                        <p className="text-xs text-muted-foreground">실행 계획 검토 단계를 활성화합니다.</p>
                      </div>
                      <Switch
                        aria-label="Plan Review"
                        checked={toolToggles.planReview}
                        onCheckedChange={(checked) => setToolToggles((prev) => ({ ...prev, planReview: checked }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">적용될 설정 변경 사항을 확인하세요.</p>
                  
                  {loadingDiff ? (
                    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground animate-pulse">
                      변경사항을 계산 중입니다...
                    </div>
                  ) : diffError ? (
                    <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-destructive">
                      <div className="text-sm font-semibold">오류가 발생했습니다</div>
                      <div className="text-xs">{diffError}</div>
                      <Button variant="outline" size="sm" onClick={() => void fetchDiff()} className="mt-2">
                        재시도
                      </Button>
                    </div>
                  ) : diffChanges.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
                      변경 사항 없음
                    </div>
                  ) : (
                    <div className="space-y-3" role="list">
                      <div className="text-sm font-medium">{diffChanges.length}건 변경</div>
                      {diffChanges.map((change, idx) => (
                        <div key={`${change.path}-${idx}`} role="listitem" className="rounded-xl border bg-card p-3 flex flex-col gap-1.5 text-sm">
                          <div className="font-semibold text-foreground break-all">{change.path}</div>
                          <div className="flex items-center gap-2 text-xs font-mono w-full">
                            <span className="text-muted-foreground bg-muted px-2 py-1 rounded truncate flex-1 opacity-70">
                              {change.from === undefined ? '(없음)' : JSON.stringify(change.from)}
                            </span>
                            <span className="text-muted-foreground shrink-0">→</span>
                            <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded truncate flex-1 font-semibold">
                              {change.to === undefined ? '(없음)' : JSON.stringify(change.to)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/25 flex-row items-center justify-between shrink-0">
          <div className="text-xs text-muted-foreground">
            {step === 1 && 'Step 1/4: 에이전트 조합 선택'}
            {step === 2 && 'Step 2/4: 성향 선택'}
            {step === 3 && 'Step 3/4: 도구 커스터마이즈'}
            {step === 4 && 'Step 4/4: 리뷰 및 적용'}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleBack} disabled={!canGoBack || initializing || applying}>
              Back
            </Button>
            {step < 4 ? (
              <Button onClick={handleNext} disabled={!canGoNext || initializing || applying}>
                Next
              </Button>
            ) : (
              <Button onClick={handleApply} disabled={!canApply}>
                {applying ? 'Applying...' : 'Apply'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}