import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

type SectionVariant = 'default' | 'highlight';

interface FlowItem {
  title: string;
  content: string;
}

interface IdeationFlowProps {
  sessionData: Record<string, unknown> | null;
}

interface FlowSectionProps {
  title: string;
  defaultOpen?: boolean;
  variant?: SectionVariant;
  children: ReactNode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const lines = value.map(toText).filter(Boolean);
    return lines.join('\n\n');
  }

  if (isRecord(value)) {
    const priorityKeys = ['opinion', 'content', 'text', 'comment', 'message', 'summary', 'result', 'synthesis', 'markdown'];
    for (const key of priorityKeys) {
      if (typeof value[key] === 'string' && value[key].trim()) {
        return String(value[key]).trim();
      }
    }
    return JSON.stringify(value, null, 2);
  }

  return '';
}

function itemTitleFromRecord(record: Record<string, unknown>, fallback: string, index: number): string {
  const titleKeys = ['name', 'role', 'model', 'author', 'provider', 'participant', 'agent', 'source', 'id', 'key'];
  for (const key of titleKeys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (record.model && typeof record.model === 'string') {
    return record.model.trim();
  }

  return `${fallback} ${index + 1}`;
}

function normalizeItems(source: unknown): FlowItem[] {
  if (!source) {
    return [];
  }

  if (typeof source === 'string') {
    const text = source.trim();
    return text ? [{ title: 'Item 1', content: text }] : [];
  }

  if (Array.isArray(source)) {
    return source
      .map((value, index) => {
        if (isRecord(value)) {
          return {
            title: itemTitleFromRecord(value, 'Item', index),
            content: toText(value)
          };
        }
        const text = toText(value);
        if (!text) {
          return null;
        }
        return { title: `Item ${index + 1}`, content: text };
      })
      .filter((item): item is FlowItem => item !== null);
  }

  if (isRecord(source)) {
    return Object.entries(source).map(([key, value], index) => ({
      title: `${key}`,
      content: toText(value)
    })).filter((item) => !!item.content);
  }

  return [];
}

function FlowSection({ title, defaultOpen = false, variant = 'default', children }: FlowSectionProps) {
  const isHighlight = variant === 'highlight';
  const sectionClass = isHighlight
    ? 'border-green-500 bg-green-500/5'
    : 'border-border bg-muted/10';

  const titleClass = isHighlight
    ? 'text-green-700 dark:text-green-400'
    : 'text-foreground';

  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-xl border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left">
        <div className={`text-sm font-semibold ${titleClass}`}>{title}</div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-data-[state=open]:rotate-90 transition-transform" />
      </CollapsibleTrigger>
      <CollapsibleContent className={`border-t border-l-4 ${sectionClass} p-4`}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function Cards({ items, fallbackText }: { items: FlowItem[]; fallbackText: string }) {
  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground">{fallbackText}</div>;
  }

  const colClass = items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3';

  return (
    <div className={`grid gap-3 ${colClass}`}>
      {items.map((item) => (
        <div key={`${item.title}-${item.content.slice(0, 20)}`} className="rounded-lg border bg-card p-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2">{item.title}</div>
          <MarkdownRenderer content={item.content} className="text-sm text-foreground" />
        </div>
      ))}
    </div>
  );
}

export function IdeationFlow({ sessionData }: IdeationFlowProps) {
  const opinions = normalizeItems(sessionData?.opinions);
  const critiques = normalizeItems(sessionData?.critiques);
  const discussionContent = toText(sessionData?.discussion);

  return (
    <div className="space-y-3">
      <FlowSection title={`Opinions (${opinions.length})`} defaultOpen={false}>
        <Cards items={opinions} fallbackText="아직 의견이 없습니다." />
      </FlowSection>

      <FlowSection title={`Critiques (${critiques.length})`} defaultOpen={false}>
        <Cards items={critiques} fallbackText="아직 비평이 없습니다." />
      </FlowSection>

      <FlowSection title="Synthesis" defaultOpen={true} variant="highlight">
        <MarkdownRenderer content={toText(sessionData?.synthesis) || '# No synthesis yet'} />
      </FlowSection>

      {discussionContent ? (
        <FlowSection title="Discussion" defaultOpen={false}>
          <MarkdownRenderer content={discussionContent} />
        </FlowSection>
      ) : null}
    </div>
  );
}
