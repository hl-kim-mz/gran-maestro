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
import { Globe, RefreshCcw, Replace, Save, Wand2 } from 'lucide-react';
import { SETTING_DESCRIPTIONS, getDescription, getOptions } from '@/config/settingDescriptions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsFindReplace } from '@/components/shared/SettingsFindReplace';
import { TagInput } from '@/components/shared/TagInput';
import { SetupWizardModal } from '@/components/shared/SetupWizardModal';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

const HIDDEN_FIELDS = ['version', 'plugin_name', 'branding'];

type FieldCardProps = {
  fieldKey: string;
  fullPath: string[];
  value: any;
  indent: number;
  description?: string;
  options?: string[];
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
  options,
  fieldStatus,
  onResetField,
  onDeleteField,
  onValueChange,
}: FieldCardProps) {
  const isInvalidOption = options && options.length > 0 && typeof value === 'string' && !options.includes(value);

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
          {isInvalidOption && (
            <Badge variant="outline" className="text-[10px] text-red-600 border-red-400 dark:text-red-400 dark:border-red-500">
              Invalid
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
            value.every((entry) => !isObject(entry) && !Array.isArray(entry)) ? (
              <TagInput
                tags={value.map(String)}
                onChange={(tags) => onValueChange(fullPath, tags)}
              />
            ) : (
              <Input value={JSON.stringify(value)} readOnly className="text-left font-mono" />
            )
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
          ) : options && options.length > 0 && typeof value === 'string' && value !== '' ? (
            <Select value={value} onValueChange={(val) => onValueChange(fullPath, val)}>
              <SelectTrigger className="w-[180px] h-9 font-mono text-left">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isInvalidOption && (
                  <SelectItem value={value} className="text-red-500 font-mono">
                    {value} (invalid)
                  </SelectItem>
                )}
                {options.map((opt) => (
                  <SelectItem key={opt} value={opt} className="font-mono">
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

function isNumericIndex(key: string) {
  return /^\d+$/.test(key);
}

function getNestedValueWithArrays(obj: any, path: string[]): any {
  let current = obj;

  for (const key of path) {
    if (current === undefined || current === null) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current !== 'object' || !(key in current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function deepSetWithArrays(obj: any, path: string[], value: any): any {
  if (path.length === 0) return value;

  const [head, ...rest] = path;

  if (Array.isArray(obj)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0) return obj;

    const clone = [...obj];
    clone[index] = deepSetWithArrays(clone[index], rest, value);
    return clone;
  }

  if (obj && typeof obj === 'object') {
    return {
      ...obj,
      [head]: deepSetWithArrays(obj[head], rest, value),
    };
  }

  if (isNumericIndex(head)) {
    const index = Number(head);
    const clone: any[] = [];
    clone[index] = deepSetWithArrays(undefined, rest, value);
    return clone;
  }

  return {
    [head]: deepSetWithArrays(undefined, rest, value),
  };
}

function deepRemoveWithArrays(obj: any, path: string[]): any {
  if (!obj || typeof obj !== 'object' || path.length === 0) {
    return obj;
  }

  const [head, ...rest] = path;

  if (Array.isArray(obj)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= obj.length) {
      return obj;
    }

    const clone = [...obj];
    if (rest.length === 0) {
      clone.splice(index, 1);
      return clone;
    }

    clone[index] = deepRemoveWithArrays(clone[index], rest);
    if (isObject(clone[index]) && Object.keys(clone[index]).length === 0) {
      clone.splice(index, 1);
    }
    return clone;
  }

  if (!(head in obj)) {
    return obj;
  }

  const clone = { ...obj };
  if (rest.length === 0) {
    delete clone[head];
    return clone;
  }

  clone[head] = deepRemoveWithArrays(obj[head], rest);
  if (isObject(clone[head]) && Object.keys(clone[head]).length === 0) {
    delete clone[head];
  }

  return clone;
}

function getRoleSlotLabel(index: number) {
  if (index === 0) return 'primary';
  if (index === 1) return 'fallback';
  return `slot_${index + 1}`;
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
  const [wizardOpen, setWizardOpen] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(['workflow']);

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

  async function handleApplyAll() {
    if (!projectId || !merged) return;

    const confirmed = window.confirm('Apply current settings to all registered projects? This will overwrite project configs.');
    if (!confirmed) return;

    setSaving(true);
    try {
      const result = await apiFetch<{
        ok: boolean;
        applied: number;
        failed: Array<{ id: string; name: string; error: string }>;
      }>('/api/config/apply-all', projectId, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(merged),
      });

      await fetchConfig();

      if (Array.isArray(result.failed) && result.failed.length > 0) {
        const failedSummary = result.failed
          .map((item) => `- ${item.name} (${item.id}): ${item.error}`)
          .join('\n');
        alert(`Applied to ${result.applied} project(s).\nFailed projects:\n${failedSummary}`);
      } else {
        alert(`Successfully applied to ${result.applied} project(s).`);
      }
    } catch (err) {
      console.error('Failed to apply config to all projects:', err);
      alert(`Failed to apply config to all projects: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  function handlePanelReplace(newConfig: any) {
    setMerged(newConfig);
    void handleSave(newConfig);
  }

  function getFieldStatus(path: string[]): 'modified' | 'custom' | null {
    const hasOverride = getNestedValueWithArrays(overrides, path) !== undefined;
    if (!hasOverride) return null;
    const hasDefault = getNestedValueWithArrays(defaults, path) !== undefined;
    return hasDefault ? 'modified' : 'custom';
  }

  function handleResetField(path: string[]) {
    if (!defaults) return;
    const defaultValue = getNestedValueWithArrays(defaults, path);
    setMerged((current: any) => deepSetWithArrays(current ?? {}, path, defaultValue));
    setOverrides((current: any) => deepRemoveWithArrays(current, path));
    setIsDirty(true);
  }

  function handleDeleteField(path: string[]) {
    setMerged((current: any) => deepRemoveWithArrays(current, path));
    setOverrides((current: any) => deepRemoveWithArrays(current, path));
    setIsDirty(true);
  }

  function handleFieldChange(path: string[], value: any) {
    setMerged((current: any) => deepSetWithArrays(current, path, value));
    setIsDirty(true);
  }

  function renderField(path: string[], key: string, value: any, depth = 0, label = key) {
    const indent = depth * 16;
    const fullPath = [...path, key];
    const descEntry = SETTING_DESCRIPTIONS[fullPath.join('.')];
    const description = getDescription(descEntry);
    const options = getOptions(descEntry);

    if (
      path.join('.') === 'models.roles' &&
      (key === 'developer' || key === 'reviewer') &&
      Array.isArray(value) &&
      value.every(isObject)
    ) {
      return (
        <div key={fullPath.join('.')}>
          <div style={{ paddingLeft: indent }} className="text-xs font-semibold text-muted-foreground py-1 mt-2">
            {label}
          </div>
          {description && (
            <div style={{ paddingLeft: indent }} className="text-xs text-muted-foreground pb-2">
              {description}
            </div>
          )}
          <div className="space-y-4">
            {value.map((item, index) => renderField(fullPath, String(index), item, depth + 1, getRoleSlotLabel(index)))}
          </div>
        </div>
      );
    }

    if (isObject(value)) {
      return (
        <div key={fullPath.join('.')}>
          <div style={{ paddingLeft: indent }} className="text-xs font-semibold text-muted-foreground py-1 mt-2">
            {label}
          </div>
          {description && (
            <div style={{ paddingLeft: indent }} className="text-xs text-muted-foreground pb-2">
              {description}
            </div>
          )}
          <div className="space-y-4">
            {Object.entries(value).map(([subKey, subVal]) => renderField([...path, key], subKey, subVal, depth + 1))}
          </div>
        </div>
      );
    }

    const fieldStatus = getFieldStatus(fullPath);

    return (
      <FieldCard
        key={fullPath.join('.')}
        fieldKey={label}
        fullPath={fullPath}
        value={value}
        indent={indent}
        description={description}
        options={options}
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

  const getSectionCounts = (sectionKey: string, sectionData: any) => {
    let fieldCount = 0;
    let modifiedCount = 0;

    const traverse = (data: any, path: string[]) => {
      if (Array.isArray(data)) {
        fieldCount++;
        const status = getFieldStatus(path);
        if (status === 'modified' || status === 'custom') modifiedCount++;
        return;
      }
      if (isObject(data)) {
        for (const [k, v] of Object.entries(data)) {
          traverse(v, [...path, k]);
        }
        return;
      }
      fieldCount++;
      const status = getFieldStatus(path);
      if (status === 'modified' || status === 'custom') modifiedCount++;
    };

    traverse(sectionData, [sectionKey]);
    return { fieldCount, modifiedCount };
  };

  const visibleSections = Object.entries(merged).filter(([key]) => !HIDDEN_FIELDS.includes(key));

  const AGENT_SECTIONS = ['discussion', 'ideation', 'collaborative_debug', 'debug', 'explore', 'prereview', 'roles'];
  const agentIndices = visibleSections
    .map(([key], index) => (AGENT_SECTIONS.includes(key) ? index : -1))
    .filter((index) => index !== -1);
  const firstAgentIndex = agentIndices.length > 0 ? agentIndices[0] : -1;
  const lastAgentIndex = agentIndices.length > 0 ? agentIndices[agentIndices.length - 1] : -1;

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
                <Button variant="outline" onClick={() => setOpenSections(visibleSections.map(([key]) => key))} disabled={saving}>
                  전부 열기
                </Button>
                <Button variant="outline" onClick={() => setOpenSections([])} disabled={saving}>
                  전부 접기
                </Button>
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
                <Button variant="outline" onClick={() => setWizardOpen(true)} disabled={saving}>
                  <Wand2 className="h-4 w-4 mr-2" /> 설정 마법사
                </Button>
                <Button variant="outline" onClick={handleApplyAll} disabled={saving || !merged}>
                  <Globe className="h-4 w-4 mr-2" /> Apply to All
                </Button>
                <Button onClick={() => handleSave()} disabled={saving} variant={isDirty ? 'default' : 'outline'}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : isDirty ? 'Save Changes *' : 'Save Changes'}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="w-full space-y-4">
                {visibleSections.map(([sectionKey, sectionData], index) => {
                  const { fieldCount, modifiedCount } = getSectionCounts(sectionKey, sectionData);
                  const isFirstAgent = index === firstAgentIndex;

                  return (
                    <React.Fragment key={sectionKey}>
                      {isFirstAgent && (
                        <div className="flex items-center gap-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <div className="flex-1 h-px bg-border"></div>
                          <span>에이전트 관련</span>
                          <div className="flex-1 h-px bg-border"></div>
                        </div>
                      )}
                      <AccordionItem value={sectionKey} className="border rounded-md bg-card shadow-sm">
                      <AccordionTrigger className="py-2 px-3 text-sm font-bold uppercase tracking-wider hover:no-underline">
                        <div className="flex items-center gap-2">
                          {sectionKey}
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                            {fieldCount}
                          </Badge>
                          {modifiedCount > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-orange-600 border-orange-400 dark:text-orange-400 dark:border-orange-500">
                              {modifiedCount} modified
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="p-3 pt-0 border-t">
                        <div className="grid grid-cols-1 gap-2 mt-3">
                          {isObject(sectionData) ? (
                            Object.entries(sectionData as object).map(([key, value]) =>
                              renderField([sectionKey], key, value)
                            )
                          ) : (
                            renderField([], sectionKey, sectionData)
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                    {index === lastAgentIndex && (
                      <div className="flex items-center gap-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <div className="flex-1 h-px bg-border"></div>
                      </div>
                    )}
                    </React.Fragment>
                  );
                })}
              </Accordion>
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
      <SetupWizardModal
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        projectId={projectId}
        onApplied={fetchConfig}
      />
    </div>
  );
}
