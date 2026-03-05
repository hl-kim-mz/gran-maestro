import React, { useEffect, useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCcw, Replace, Save } from 'lucide-react';
import { SETTING_DESCRIPTIONS } from '@/config/settingDescriptions';
import { SettingsFindReplace } from '@/components/shared/SettingsFindReplace';
import { TagInput } from '@/components/shared/TagInput';
import { PresetSection } from '@/components/shared/PresetSection';
import { Separator } from '@/components/ui/separator';
import { deepSet, getNestedValue, deepRemove } from '@/lib/utils';

type FieldCardProps = {
  fieldKey: string;
  fullPath: string[];
  value: any;
  indent: number;
  description?: string;
  fieldStatus: 'modified' | 'custom' | null;
  onResetField: (path: string[]) => void;
  onDeleteField: (path: string[]) => void;
  onValueChange: (path: string[], value: any) => void;
};

const FieldCard = React.memo(function FieldCard({
  fieldKey,
  fullPath,
  value,
  indent,
  description,
  fieldStatus,
  onResetField,
  onDeleteField,
  onValueChange,
}: FieldCardProps) {
  return (
    <Card style={{ marginLeft: indent }}>
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold font-mono">{fieldKey}</div>
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
        <div className="flex-1 max-w-md flex flex-wrap justify-end items-center gap-2">
          {fieldStatus === 'modified' && (
            <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-400 dark:text-blue-400 dark:border-blue-500">
              Modified
            </Badge>
          )}
          {fieldStatus === 'custom' && (
            <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-400 dark:text-orange-400 dark:border-orange-500">
              Custom
            </Badge>
          )}
          {fieldStatus === 'modified' && (
            <Button variant="outline" size="sm" onClick={() => onResetField(fullPath)}>
              Reset to default
            </Button>
          )}
          {fieldStatus === 'custom' && (
            <Button variant="outline" size="sm" onClick={() => onDeleteField(fullPath)}>
              Delete
            </Button>
          )}
          {Array.isArray(value) ? (
            <TagInput
              tags={value.map(String)}
              onChange={(tags) => onValueChange(fullPath, tags)}
            />
          ) : value === null ? (
            <Input
              value=""
              placeholder="null"
              className="text-left font-mono"
              onChange={(e) => {
                const val = e.target.value === '' ? null : e.target.value;
                onValueChange(fullPath, val);
              }}
            />
          ) : typeof value === 'boolean' ? (
            <Switch checked={value} onCheckedChange={(checked) => onValueChange(fullPath, checked)} />
          ) : (
            <Input
              value={value}
              type={typeof value === 'number' ? 'number' : 'text'}
              className="text-left font-mono"
              onChange={(e) => {
                const val = typeof value === 'number' ? Number(e.target.value) : e.target.value;
                onValueChange(fullPath, val);
              }}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
});

function isObject(v: any) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function SettingsView() {
  const { projectId, lastSseEvent } = useAppContext();
  const [merged, setMerged] = useState<any>(null);
  const [overrides, setOverrides] = useState<any>(null);
  const [defaults, setDefaults] = useState<any>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    fetchConfig();
  }, [projectId]);

  // SSE config_change auto-refresh
  useEffect(() => {
    if (!lastSseEvent || !projectId) return;
    if (lastSseEvent.type === 'config_change') {
      fetchConfig();
    }
  }, [lastSseEvent]);

  async function fetchConfig() {
    setLoading(true);
    try {
      const data = await apiFetch<{ merged: any; overrides: any; defaults: any }>('/api/config', projectId);
      setMerged(data.merged ?? null);
      setOverrides(data.overrides ?? null);
      setDefaults(data.defaults ?? null);
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to fetch config:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(nextConfig?: any) {
    if (!projectId) return;
    const payload = nextConfig ?? merged;
    if (!payload) return;

    setSaving(true);
    try {
      await apiFetch('/api/config', projectId, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      await fetchConfig();
    } catch (err) {
      console.error('Failed to save config:', err);
      alert(`Failed to save config: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  function handlePanelReplace(newConfig: any) {
    setMerged(newConfig);
    void handleSave(newConfig);
  }

  function getFieldStatus(path: string[]): 'modified' | 'custom' | null {
    const hasOverride = getNestedValue(overrides, path) !== undefined;
    if (!hasOverride) return null;
    const hasDefault = getNestedValue(defaults, path) !== undefined;
    return hasDefault ? 'modified' : 'custom';
  }

  function handleResetField(path: string[]) {
    if (!defaults) return;
    const defaultValue = getNestedValue(defaults, path);
    setMerged((current: any) => deepSet(current ?? {}, path, defaultValue));
    setOverrides((current: any) => deepRemove(current, path));
    setIsDirty(true);
  }

  function handleDeleteField(path: string[]) {
    setMerged((current: any) => deepRemove(current, path));
    setOverrides((current: any) => deepRemove(current, path));
    setIsDirty(true);
  }

  function handleFieldChange(path: string[], value: any) {
    setMerged((current: any) => deepSet(current, path, value));
    setIsDirty(true);
  }

  function renderField(path: string[], key: string, value: any, depth = 0) {
    const indent = depth * 16;

    if (isObject(value)) {
      return (
        <div key={key}>
          <div style={{ paddingLeft: indent }} className="text-xs font-semibold text-muted-foreground py-1 mt-2">
            {key}
          </div>
          <div className="space-y-4">
            {Object.entries(value).map(([subKey, subVal]) => renderField([...path, key], subKey, subVal, depth + 1))}
          </div>
        </div>
      );
    }

    const fullPath = [...path, key];
    const description = SETTING_DESCRIPTIONS[fullPath.join('.')];
    const fieldStatus = getFieldStatus(fullPath);

    return (
      <FieldCard
        key={key}
        fieldKey={key}
        fullPath={fullPath}
        value={value}
        indent={indent}
        description={description}
        fieldStatus={fieldStatus}
        onResetField={handleResetField}
        onDeleteField={handleDeleteField}
        onValueChange={handleFieldChange}
      />
    );
  }

  if (!projectId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        프로젝트를 선택하세요
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!merged) return <div className="p-8 text-center">Failed to load config.</div>;

  const topLevelPrimitives = Object.entries(merged).filter(([, value]) => !isObject(value));
  const sections = Object.entries(merged).filter(([, value]) => isObject(value));

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 min-w-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-8 max-w-4xl mx-auto pb-20">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold">Settings</h2>
                <p className="text-muted-foreground text-sm">System configuration and preferences.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={panelOpen ? 'secondary' : 'outline'}
                  size="icon"
                  onClick={() => setPanelOpen((open) => !open)}
                  title="찾아 바꾸기"
                  disabled={saving}
                >
                  <Replace className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={fetchConfig} disabled={saving}>
                  <RefreshCcw className="h-4 w-4 mr-2" /> Reload
                </Button>
                <Button onClick={() => handleSave()} disabled={saving} variant={isDirty ? 'default' : 'outline'}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : isDirty ? 'Save Changes *' : 'Save Changes'}
                </Button>
              </div>
            </div>

            <div className="space-y-8">
              <section>
                <PresetSection projectId={projectId} onApplied={fetchConfig} />
              </section>
              <Separator className="my-6" />

              {topLevelPrimitives.length > 0 && (
                <section>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 px-1">Plugin Info</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {topLevelPrimitives.map(([key, value]) => renderField([], key, value))}
                  </div>
                </section>
              )}

              {sections.map(([section, values]: [string, any]) => (
                <section key={section}>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 px-1">
                    {section}
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {Object.entries(values).map(([key, value]: [string, any]) => renderField([section], key, value))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>
      <div
        className="transition-all duration-300 ease-in-out border-l bg-background overflow-hidden shrink-0"
        style={{ width: panelOpen ? '360px' : '0px', pointerEvents: panelOpen ? 'auto' : 'none' }}
      >
        <div className="w-[360px] h-full">
          <SettingsFindReplace config={merged} onReplace={handlePanelReplace} onClose={() => setPanelOpen(false)} />
        </div>
      </div>
    </div>
  );
}
