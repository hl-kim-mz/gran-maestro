import { useState, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { apiFetch } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Save, RefreshCcw } from 'lucide-react';
import { SETTING_DESCRIPTIONS } from '@/config/settingDescriptions';

function isObject(v: any) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepSet(obj: any, path: string[], value: any): any {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  return { ...obj, [head]: deepSet(obj?.[head] ?? {}, rest, value) };
}

export function SettingsView() {
  const { projectId, activeTab } = useAppContext();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!projectId || activeTab !== 'settings') {
      setLoading(false);
      return;
    }
    fetchConfig();
  }, [projectId, activeTab]);

  async function fetchConfig() {
    setLoading(true);
    try {
      const data = await apiFetch<any>('/api/config', projectId);
      setConfig(data);
    } catch (err) {
      console.error('Failed to fetch config:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('/api/config', projectId, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      });
      alert('Config saved successfully');
    } catch (err) {
      console.error('Failed to save config:', err);
      alert(`Failed to save config: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
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

    return (
      <Card key={key} style={{ marginLeft: indent }}>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold font-mono">{key}</div>
            {description && (
              <div className="text-xs text-muted-foreground">{description}</div>
            )}
          </div>
          <div className="flex-1 max-w-md flex justify-end">
            {value === null ? (
              <Input
                value=""
                placeholder="null"
                className="text-left font-mono"
                onChange={(e) => {
                  const val = e.target.value === '' ? null : e.target.value;
                  setConfig((current: any) => deepSet(current, fullPath, val));
                }}
              />
            ) : typeof value === 'boolean' ? (
              <Switch
                checked={value}
                onCheckedChange={(checked) => setConfig((current: any) => deepSet(current, fullPath, checked))}
              />
            ) : (
              <Input
                value={value}
                type={typeof value === 'number' ? 'number' : 'text'}
                className="text-left font-mono"
                onChange={(e) => {
                  const val = typeof value === 'number' ? Number(e.target.value) : e.target.value;
                  setConfig((current: any) => deepSet(current, fullPath, val));
                }}
              />
            )}
          </div>
        </CardContent>
      </Card>
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
    return <div className="p-8 max-w-2xl mx-auto space-y-6">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>;
  }

  if (!config) return <div className="p-8 text-center">Failed to load config.</div>;

  const topLevelPrimitives = Object.entries(config).filter(([, value]) => !isObject(value));
  const sections = Object.entries(config).filter(([, value]) => isObject(value));

  return (
    <ScrollArea className="h-full">
      <div className="p-8 max-w-4xl mx-auto pb-20">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold">Settings</h2>
            <p className="text-muted-foreground text-sm">System configuration and preferences.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchConfig} disabled={saving}>
              <RefreshCcw className="h-4 w-4 mr-2" /> Reset
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>

        <div className="space-y-8">
          {topLevelPrimitives.length > 0 && (
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 px-1">Plugin Info</h3>
              <div className="grid grid-cols-1 gap-4">
                {topLevelPrimitives.map(([key, value]) => {
                  const topLevelDescription = SETTING_DESCRIPTIONS[key];
                  return (
                    <Card key={key}>
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold font-mono">{key}</div>
                          <div className="text-xs text-muted-foreground">{String(value)}</div>
                          {topLevelDescription && (
                            <div className="text-xs text-muted-foreground">{topLevelDescription}</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {sections.map(([section, values]: [string, any]) => (
            <section key={section}>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 px-1">{section}</h3>
              <div className="grid grid-cols-1 gap-4">
                {Object.entries(values).map(([key, value]: [string, any]) => renderField([section], key, value))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
