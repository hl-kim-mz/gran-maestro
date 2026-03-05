import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/hooks/useApi';
import { PresetCard } from './PresetCard';
import { PresetDiffDialog } from './PresetDiffDialog';
import type { PresetListResponse, PresetMeta } from '../../../../src/types';

type PresetSectionProps = {
  projectId: string;
  onApplied: () => void;
};

export function PresetSection({ projectId, onApplied }: PresetSectionProps) {
  const [data, setData] = useState<PresetListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // For Diff Dialog
  const [selectedPreset, setSelectedPreset] = useState<PresetMeta | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);

  // For Save Custom Preset
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchPresets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<PresetListResponse>('/api/presets', projectId);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchPresets();
    }
  }, [projectId]);

  const handleCardClick = (preset: PresetMeta) => {
    setSelectedPreset(preset);
    setDiffOpen(true);
  };

  const handleSaveSubmit = async () => {
    if (!saveName.trim() || !projectId) return;
    setSaving(true);
    const id = saveName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    try {
      await apiFetch('/api/presets', projectId, {
        method: 'POST',
        body: JSON.stringify({ id, name: saveName.trim() }),
      });
      setSaveOpen(false);
      setSaveName('');
      await fetchPresets();
    } catch (err) {
      alert(`Failed to save preset: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground animate-pulse">Loading presets...</div>;
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold">Presets</h3>
          <p className="text-muted-foreground text-sm">프리셋을 불러올 수 없습니다.</p>
        </div>
      </div>
    );
  }

  // Grid logic
  const tiers = ['perf', 'eff', 'budg'];
  const tierLabels: Record<string, string> = { perf: '성능 (Performance)', eff: '효율 (Efficiency)', budg: '절약 (Budget)' };
  const categories = ['full', 'codex', 'gemini', 'claude'];
  const categoryLabels: Record<string, string> = { full: 'Full', codex: 'Codex Only', gemini: 'Gemini Only', claude: 'Claude Only' };

  const getPreset = (tier: string, category: string) => {
    return data.builtin.find((p) => p.tier === tier && p.category === category);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold">Presets</h3>
          <p className="text-muted-foreground text-sm">Apply predefined configurations.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
          현재 설정 저장
        </Button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-[120px_1fr_1fr_1fr_1fr] gap-4 mb-2 text-sm font-semibold text-muted-foreground text-center">
            <div></div>
            {categories.map((cat) => (
              <div key={cat}>{categoryLabels[cat] || cat}</div>
            ))}
          </div>
          <div className="space-y-4">
            {tiers.map((tier) => (
              <div key={tier} className="grid grid-cols-[120px_1fr_1fr_1fr_1fr] gap-4 items-center">
                <div className="text-sm font-semibold text-muted-foreground text-right pr-4">
                  {tierLabels[tier] || tier}
                </div>
                {categories.map((cat) => {
                  const preset = getPreset(tier, cat);
                  return (
                    <div key={cat} className="h-full">
                      {preset ? (
                        <PresetCard preset={preset} onClick={() => handleCardClick(preset)} />
                      ) : (
                        <div className="h-full rounded-xl border border-dashed flex items-center justify-center p-4 text-muted-foreground text-xs">
                          N/A
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {data.user && data.user.length > 0 && (
        <>
          <Separator className="my-6" />
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 px-1">
              내 프리셋 (User Presets)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.user.map((preset) => (
                <PresetCard key={preset.id} preset={preset} onClick={() => handleCardClick(preset)} />
              ))}
            </div>
          </div>
        </>
      )}

      <PresetDiffDialog
        open={diffOpen}
        preset={selectedPreset}
        projectId={projectId}
        onClose={() => setDiffOpen(false)}
        onApply={() => {
          setDiffOpen(false);
          onApplied();
        }}
      />

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>현재 설정 저장</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="프리셋 이름"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-2">
              이름을 입력하면 ID가 자동으로 생성됩니다.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={handleSaveSubmit} disabled={!saveName.trim() || saving}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
