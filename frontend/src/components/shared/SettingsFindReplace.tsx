import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { deepSet } from '@/lib/utils';

interface MatchItem {
  path: string[];
  value: any;
}

interface SettingsFindReplaceProps {
  config: any;
  onReplace: (nextConfig: any) => void;
  onClose: () => void;
}

function isObject(value: any): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findMatches(obj: any, search: string, path: string[] = []): MatchItem[] {
  if (Array.isArray(obj)) {
    const results: MatchItem[] = [];

    for (const [index, value] of obj.entries()) {
      const currentPath = [...path, String(index)];
      if (Array.isArray(value) || isObject(value)) {
        results.push(...findMatches(value, search, currentPath));
      } else if (String(value) === search) {
        results.push({ path: currentPath, value });
      }
    }

    return results;
  }

  if (!isObject(obj)) return [];
  const results: MatchItem[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = [...path, key];
    if (Array.isArray(value) || isObject(value)) {
      results.push(...findMatches(value, search, currentPath));
    } else if (String(value) === search) {
      results.push({ path: currentPath, value });
    }
  }

  return results;
}

function formatValue(value: any): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  return String(value);
}

function normalizeReplacementValue(referenceValue: any, replacement: string) {
  if (typeof referenceValue === 'number') {
    const normalized = Number(replacement);
    return Number.isNaN(normalized) ? replacement : normalized;
  }

  if (typeof referenceValue === 'boolean') {
    if (replacement.toLowerCase() === 'true') return true;
    if (replacement.toLowerCase() === 'false') return false;
    return replacement;
  }

  return replacement;
}

export function SettingsFindReplace({ config, onReplace, onClose }: SettingsFindReplaceProps) {
  const [searchValue, setSearchValue] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [searched, setSearched] = useState(false);

  function handleSearch() {
    const trimmedSearch = searchValue.trim();
    if (!trimmedSearch) {
      setMatches([]);
      setSearched(false);
      return;
    }
    setMatches(findMatches(config, trimmedSearch));
    setSearched(true);
  }

  function handleReplaceAll() {
    if (matches.length === 0) return;

    let nextConfig = config;
    for (const match of matches) {
      const nextValue = normalizeReplacementValue(match.value, replaceValue);
      nextConfig = deepSet(nextConfig, match.path, nextValue);
    }
    onReplace(nextConfig);
  }

  return (
    <aside className="h-full border-l p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">찾아 바꾸기</div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted-foreground">찾기</div>
        <div className="flex gap-2">
          <Input
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
              setMatches([]);
              setSearched(false);
            }}
            placeholder="찾을 value"
          />
          <Button onClick={handleSearch} disabled={!searchValue.trim()} title="검색">
            <Search className="h-4 w-4 mr-2" />
            검색
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted-foreground">바꾸기</div>
        <Input
          value={replaceValue}
          onChange={(e) => setReplaceValue(e.target.value)}
          placeholder="교체할 value"
        />
      </div>

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
          {searched ? `${matches.length}개 항목 발견` : '아직 검색이 없습니다'}
        </div>
        {searched && matches.length === 0 ? (
          <div className="text-sm text-muted-foreground">일치하는 항목 없음</div>
        ) : (
          <div className="space-y-2">
            {matches.map((match) => (
              <div key={match.path.join('.')} className="rounded border p-2 text-xs space-y-1">
                <div className="font-mono text-muted-foreground">{match.path.join('.')}</div>
                <div>{formatValue(match.value)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button className="w-full" onClick={handleReplaceAll} disabled={matches.length === 0}>
        전체 교체
      </Button>
    </aside>
  );
}
