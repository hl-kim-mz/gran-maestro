import React, { useEffect, useState } from 'react';
import { Bookmark, Check, Edit, Trash2, Save, X, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiFetch, ApiFetchError } from '@/hooks/useApi';
import type { PresetMeta, PresetDiffChange, PresetListResponse } from '../../../../src/types';

type PresetManagerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onApplied: () => void;
};

type ViewState = 'list' | 'save' | 'diff' | 'delete' | 'edit';

function isConflictError(error: unknown): boolean {
  if (error instanceof ApiFetchError) {
    return error.status === 409;
  }

  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status?: unknown }).status === 409;
  }

  return error instanceof Error && /\b409\b/.test(error.message);
}

export function PresetManagerModal({ open, onOpenChange, projectId, onApplied }: PresetManagerModalProps) {
  const [view, setView] = useState<ViewState>('list');
  const [loading, setLoading] = useState(false);
  const [presets, setPresets] = useState<{ builtin: PresetMeta[]; user: PresetMeta[] }>({ builtin: [], user: [] });
  const [selectedPreset, setSelectedPreset] = useState<PresetMeta | null>(null);
  
  // Save/Edit State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saveError, setSaveError] = useState('');
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  
  // Diff State
  const [diffChanges, setDiffChanges] = useState<PresetDiffChange[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (open && projectId) {
      void fetchPresets();
      setView('list');
      resetForms();
    }
  }, [open, projectId]);

  const fetchPresets = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<PresetListResponse>('/api/presets', projectId);
      setPresets({ builtin: data.builtin || [], user: data.user || [] });
    } catch (err) {
      console.error('Failed to fetch presets:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForms = () => {
    setName('');
    setDescription('');
    setSaveError('');
    setShowOverwriteConfirm(false);
    setSelectedPreset(null);
    setDiffChanges([]);
  };

  const handleSaveCurrent = async (force = false) => {
    if (!name.trim()) {
      setSaveError('이름을 입력하세요.');
      return;
    }
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!id) {
      setSaveError('유효한 ID를 생성할 수 없는 이름입니다.');
      return;
    }

    setLoading(true);
    setSaveError('');
    try {
      await apiFetch('/api/presets', projectId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: name.trim(), description: description.trim(), force }),
      });
      await fetchPresets();
      setView('list');
      resetForms();
    } catch (err: unknown) {
      if (isConflictError(err)) {
        setShowOverwriteConfirm(true);
      } else {
        setSaveError(err instanceof Error ? err.message : '저장 실패');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (preset: PresetMeta) => {
    setSelectedPreset(preset);
    setView('diff');
    setLoading(true);
    try {
      const data = await apiFetch<{ changes: PresetDiffChange[] }>(`/api/presets/${preset.id}/diff`, projectId, { method: 'POST' });
      setDiffChanges(data.changes || []);
    } catch (err: any) {
      console.error('Failed to fetch diff:', err);
      setDiffChanges([]);
      alert(`미리보기를 불러오지 못했습니다: ${err.message}`);
      setView('list');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedPreset) return;
    setApplying(true);
    try {
      await apiFetch(`/api/presets/${selectedPreset.id}/apply`, projectId, { method: 'POST' });
      alert('프리셋이 성공적으로 적용되었습니다.');
      onApplied();
      onOpenChange(false);
    } catch (err: any) {
      alert(`프리셋 적용 실패: ${err.message}`);
    } finally {
      setApplying(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPreset) return;
    setLoading(true);
    try {
      await apiFetch(`/api/presets/${selectedPreset.id}`, projectId, { method: 'DELETE' });
      await fetchPresets();
      setView('list');
      setSelectedPreset(null);
    } catch (err: any) {
      alert(`삭제 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSave = async () => {
    if (!selectedPreset) return;
    if (!name.trim()) {
      setSaveError('이름을 입력하세요.');
      return;
    }
    setLoading(true);
    setSaveError('');
    try {
      await apiFetch(`/api/presets/${selectedPreset.id}`, projectId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      await fetchPresets();
      setView('list');
      resetForms();
    } catch (err: any) {
      setSaveError(err.message || '편집 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !applying && onOpenChange(open)}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="px-6 py-5 border-b shrink-0 flex flex-row items-center gap-2">
          <Bookmark className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <DialogTitle>
              {view === 'list' && '프리셋 관리'}
              {view === 'save' && '현재 설정 저장'}
              {view === 'diff' && '프리셋 적용 미리보기'}
              {view === 'delete' && '프리셋 삭제 확인'}
              {view === 'edit' && '프리셋 편집'}
            </DialogTitle>
            <DialogDescription className="mt-1.5">
              {view === 'list' && '자주 사용하는 설정 조합을 저장하고 빠르게 복원하세요.'}
              {view === 'save' && '현재 워크스페이스의 설정을 사용자 프리셋으로 저장합니다.'}
              {view === 'diff' && `"${selectedPreset?.name}" 적용 시 변경될 항목입니다.`}
              {view === 'delete' && '이 프리셋을 삭제하시겠습니까?'}
              {view === 'edit' && '프리셋 이름과 설명을 수정합니다.'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-muted/10 relative">
          <ScrollArea className="h-full px-6 py-6 min-h-[300px]">
            {view === 'list' && (
              <div className="space-y-6">
                <div className="flex justify-end">
                  <Button onClick={() => { resetForms(); setView('save'); }}>
                    <Save className="h-4 w-4 mr-2" />
                    현재 설정 저장
                  </Button>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    사용자 프리셋
                    <Badge variant="secondary" className="text-[10px]">{presets.user.length}</Badge>
                  </h3>
                  {presets.user.length === 0 ? (
                    <div className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
                      저장된 사용자 프리셋이 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {presets.user.map(preset => (
                        <div key={preset.id} className="border rounded-lg p-4 bg-card flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                          <div className="space-y-1">
                            <div className="font-semibold text-sm">{preset.name}</div>
                            {preset.description && <div className="text-xs text-muted-foreground">{preset.description}</div>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handlePreview(preset)}>적용</Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                              setSelectedPreset(preset);
                              setName(preset.name);
                              setDescription(preset.description || '');
                              setView('edit');
                            }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => {
                              setSelectedPreset(preset);
                              setView('delete');
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    빌트인 프리셋
                    <Badge variant="secondary" className="text-[10px]">{presets.builtin.length}</Badge>
                  </h3>
                  <div className="space-y-2">
                    {presets.builtin.map(preset => (
                      <div key={preset.id} className="border rounded-lg p-4 bg-card flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{preset.name}</span>
                            <Badge variant="outline" className="text-[10px]">Built-in</Badge>
                          </div>
                          {preset.description && <div className="text-xs text-muted-foreground">{preset.description}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handlePreview(preset)}>적용</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(view === 'save' || view === 'edit') && (
              <div className="space-y-4 max-w-md mx-auto py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">프리셋 이름</label>
                  <Input 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder="예: My Claude Only Preset" 
                    disabled={loading || showOverwriteConfirm}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">설명 (선택사항)</label>
                  <Input 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    placeholder="예: 프로젝트 X를 위한 기본 설정" 
                    disabled={loading || showOverwriteConfirm}
                  />
                </div>
                {saveError && <div className="text-sm text-destructive">{saveError}</div>}
                {showOverwriteConfirm && (
                  <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20 space-y-3">
                    <p>동일한 ID의 프리셋이 이미 존재합니다. 덮어쓰시겠습니까?</p>
                    <div className="flex gap-2">
                      <Button variant="destructive" size="sm" onClick={() => handleSaveCurrent(true)} disabled={loading}>덮어쓰기</Button>
                      <Button variant="outline" size="sm" onClick={() => setShowOverwriteConfirm(false)} disabled={loading}>취소</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === 'diff' && (
              <div className="space-y-4">
                {loading ? (
                  <div className="text-center text-sm text-muted-foreground py-10 animate-pulse">변경사항 비교 중...</div>
                ) : diffChanges.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-10 border border-dashed rounded-lg bg-muted/20">
                    현재 설정과 동일하여 변경사항이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm font-medium mb-3">{diffChanges.length}건 변경</div>
                    {diffChanges.map((change, idx) => (
                      <div key={idx} className="rounded-xl border bg-card p-3 flex flex-col gap-1.5 text-sm">
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

            {view === 'delete' && selectedPreset && (
              <div className="py-10 flex flex-col items-center justify-center text-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                  <Trash2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedPreset.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">이 동작은 되돌릴 수 없습니다.</p>
                </div>
              </div>
            )}

          </ScrollArea>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/25 flex-row items-center justify-between shrink-0">
          {view === 'list' ? (
            <div className="w-full flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
            </div>
          ) : (
            <>
              <Button variant="outline" onClick={() => {
                if (view === 'save' && showOverwriteConfirm) {
                  setShowOverwriteConfirm(false);
                } else {
                  setView('list');
                  resetForms();
                }
              }} disabled={loading || applying}>
                <ArrowLeft className="h-4 w-4 mr-2" /> 돌아가기
              </Button>
              <div className="flex gap-2">
                {view === 'save' && !showOverwriteConfirm && (
                  <Button onClick={() => handleSaveCurrent()} disabled={loading}>저장</Button>
                )}
                {view === 'edit' && (
                  <Button onClick={handleEditSave} disabled={loading}>저장</Button>
                )}
                {view === 'diff' && (
                  <Button onClick={handleApply} disabled={loading || applying}>
                    {applying ? '적용 중...' : '적용'}
                  </Button>
                )}
                {view === 'delete' && (
                  <Button variant="destructive" onClick={handleDelete} disabled={loading}>삭제</Button>
                )}
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
