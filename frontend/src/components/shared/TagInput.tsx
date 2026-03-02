import { useState, type KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagInput({ tags, onChange }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed && !tags.includes(trimmed)) {
        onChange([...tags, trimmed]);
      }
      setInputValue('');
    }
  }

  function handleRemove(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
      {tags.map((tag, i) => (
        <Badge key={`${tag}-${i}`} variant="secondary" className="gap-1 shrink-0">
          <span className="font-mono text-xs">{tag}</span>
          <button
            type="button"
            className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
            onClick={() => handleRemove(i)}
            aria-label={`Remove ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add..."
        className="h-7 min-w-[80px] w-auto flex-1 text-xs font-mono"
      />
    </div>
  );
}
