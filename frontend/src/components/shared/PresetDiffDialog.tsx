import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiFetch } from '@/hooks/useApi';
import type { PresetMeta, PresetDiffChange } from '../../../../src/types';

type PresetDiffDialogProps = {
  open: boolean;
  preset: PresetMeta | null;
  projectId: string;
  onClose: () => void;
  onApply: () => void;
};

export function PresetDiffDialog({ open, preset, projectId, onClose, onApply }: PresetDiffDialogProps) {
  const [changes, setChanges] = useState<PresetDiffChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !preset || !projectId) {
      setChanges([]);
      setError(null);
      return;
    }

    let isMounted = true;
    const fetchDiff = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFetch<{ changes: PresetDiffChange[] }>(
          `/api/presets/${preset.id}/diff`,
          projectId,
          { method: 'POST' }
        );
        if (isMounted) {
          setChanges(result.changes);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchDiff();

    return () => {
      isMounted = false;
    };
  }, [open, preset, projectId]);

  const handleApply = async () => {
    if (!preset || !projectId) return;
    setApplying(true);
    setError(null);
    try {
      await apiFetch(
        `/api/presets/${preset.id}/apply`,
        projectId,
        { method: 'POST' }
      );
      onApply();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setApplying(false);
    }
  };

  const formatValue = (val: unknown) => {
    if (val === undefined) return 'undefined';
    if (val === null) return 'null';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{preset?.name} 적용 미리보기</DialogTitle>
          <DialogDescription>
            {preset?.name} 프리셋을 적용할 때 변경될 설정 항목입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 py-4">
          {error ? (
            <div className="p-4 text-red-500 bg-red-50 dark:bg-red-950/50 rounded-md text-sm">
              {error}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              변경 항목을 불러오는 중...
            </div>
          ) : changes.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              변경 사항이 없습니다.
            </div>
          ) : (
            <ScrollArea className="h-full border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                  <tr className="border-b text-left">
                    <th className="px-4 py-2 font-medium">설정 경로</th>
                    <th className="px-4 py-2 font-medium">현재 값</th>
                    <th className="px-4 py-2 font-medium">변경 값</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {changes.map((change, idx) => (
                    <tr key={idx} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-2 font-mono text-xs">{change.path}</td>
                      <td className="px-4 py-2 font-mono text-xs text-red-600 dark:text-red-400">
                        {formatValue(change.from)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-green-600 dark:text-green-400">
                        {formatValue(change.to)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="mt-auto pt-4">
          <Button variant="outline" onClick={onClose} disabled={applying}>
            취소
          </Button>
          <Button onClick={handleApply} disabled={loading || applying || changes.length === 0}>
            {applying ? '적용 중...' : '적용'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
