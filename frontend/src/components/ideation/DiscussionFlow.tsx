import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface DiscussionFlowProps {
  sessionData: Record<string, unknown> | null;
}

interface FlowItem {
  title: string;
  content: string;
}

interface FlowSectionProps {
  title: string;
  defaultOpen?: boolean;
  variant?: 'default' | 'highlight';
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
    return value
      .map((item) => toText(item))
      .filter((item) => !!item)
      .join('\n\n');
  }

  if (isRecord(value)) {
    const priorityKeys = ['content', 'text', 'comment', 'response', 'message', 'summary', 'result', 'synthesis', 'consensus', 'markdown'];
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
  const candidateKeys = ['name', 'role', 'model', 'author', 'provider', 'participant', 'agent', 'source', 'id', 'key'];
  for (const key of candidateKeys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
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
    return Object.entries(source)
      .map(([key, value]) => ({
        title: key,
        content: toText(value)
      }))
      .filter((item) => !!item.content);
  }

  return [];
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeRounds(source: unknown): Array<{ title: string; data: Record<string, unknown>; index: number }> {
  if (Array.isArray(source)) {
    return source
      .map((value, index) => ({
        title: `Round ${index + 1}`,
        data: isRecord(value) ? value : {},
        index
      }))
      .filter((round) => round.data);
  }

  if (isRecord(source)) {
    return Object.entries(source)
      .map(([key, value], index) => {
        const roundNumber =
          toNumberValue((isRecord(value) ? value.round : null) ?? toNumberValue((isRecord(value) ? value.round_number : null))) ??
          toNumberValue(key) ??
          index + 1;
        const title = `Round ${roundNumber}`;
        return {
          title,
          data: isRecord(value) ? value : {},
          index
        };
      })
      .sort((a, b) => {
        const aNum = toNumberValue(toText(a.data.round)) ?? toNumberValue(a.data.round_number) ?? a.index + 1;
        const bNum = toNumberValue(toText(b.data.round)) ?? toNumberValue(b.data.round_number) ?? b.index + 1;
        return aNum - bNum;
      });
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

  if (items.length >= 3) {
    return (
      <Tabs defaultValue="__all__">
        <TabsList className="flex flex-wrap justify-start h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="__all__" className="text-xs">
            전체
          </TabsTrigger>
          {items.map((item, index) => (
            <TabsTrigger key={`${item.title}-${index}`} value={`${item.title}-${index}`} className="text-xs">
              {item.title}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="__all__" className="mt-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {items.map((item, index) => (
              <div key={`${item.title}-${index}`} className="rounded-lg border bg-card p-3 overflow-auto">
                <div className="text-xs font-semibold text-muted-foreground mb-2">{item.title}</div>
                <MarkdownRenderer content={item.content} className="text-sm text-foreground" />
              </div>
            ))}
          </div>
        </TabsContent>
        {items.map((item, index) => (
          <TabsContent key={`${item.title}-${index}`} value={`${item.title}-${index}`} className="mt-3">
            <div className="rounded-lg border bg-card p-3">
              <MarkdownRenderer content={item.content} className="text-sm text-foreground" />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={`${item.title}-${item.content.slice(0, 20)}`} className="rounded-lg border bg-card p-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2">{item.title}</div>
          <MarkdownRenderer content={item.content} className="text-sm text-foreground" />
        </div>
      ))}
    </div>
  );
}

export function DiscussionFlow({ sessionData }: DiscussionFlowProps) {
  const rounds = normalizeRounds(sessionData?.rounds);
  const finalConsensus = toText(sessionData?.consensus);

  return (
    <div className="space-y-3">
      <FlowSection title={`Rounds (${rounds.length})`} defaultOpen={false}>
        {rounds.length > 0 ? (
          <div className="space-y-3">
            {rounds.map((round, roundIndex) => {
              const responses = normalizeItems(round.data.responses);
              const critiques = normalizeItems(round.data.critiques);
              const synthesis = toText(round.data.synthesis);

              return (
                <div key={`${round.title}-${roundIndex}`} className="space-y-2">
                  <div className="text-sm font-semibold text-muted-foreground">{round.title}</div>
                  <FlowSection title={`Responses (${responses.length})`} defaultOpen={false}>
                    <Cards items={responses} fallbackText="아직 응답이 없습니다." />
                  </FlowSection>
                  {(() => {
                    const critiqueRawData = round.data.critiques;
                    const hasPendingCritiques =
                      critiqueRawData !== null &&
                      critiqueRawData !== undefined &&
                      typeof critiqueRawData === 'object' &&
                      !Array.isArray(critiqueRawData) &&
                      Object.keys(critiqueRawData as Record<string, unknown>).length > 0 &&
                      Object.values(critiqueRawData as Record<string, unknown>).every(v => v === null);

                    const critiqueFallbackText = hasPendingCritiques
                      ? 'Critic 평가 대기 중...'
                      : '아직 비평이 없습니다.';

                    return (
                      <FlowSection title={`Critiques (${critiques.length})`} defaultOpen={false}>
                        <Cards items={critiques} fallbackText={critiqueFallbackText} />
                      </FlowSection>
                    );
                  })()}
                  <FlowSection title={`Round ${roundIndex + 1} Synthesis`} defaultOpen={false}>
                    <MarkdownRenderer content={synthesis || 'Synthesis 데이터가 아직 없습니다.'} />
                  </FlowSection>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">아직 라운드 없음</div>
        )}
      </FlowSection>

      <FlowSection title="Final Consensus" defaultOpen={true} variant="highlight">
        <MarkdownRenderer content={finalConsensus || '합의 도출 중...'} />
      </FlowSection>
    </div>
  );
}
