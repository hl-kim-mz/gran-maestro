import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PresetMeta } from '../../../../src/types';

type PresetCardProps = {
  preset: PresetMeta;
  isActive?: boolean;
  onClick: () => void;
};

export function PresetCard({ preset, isActive, onClick }: PresetCardProps) {
  const tierColorMap: Record<string, string> = {
    perf: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-300 dark:border-green-700',
    eff: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700',
    budg: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-300 dark:border-orange-700',
  };

  const defaultTierStyle = 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
  const tierStyle = preset.tier ? tierColorMap[preset.tier] || defaultTierStyle : defaultTierStyle;

  return (
    <Card
      className={`cursor-pointer transition-colors hover:border-primary ${
        isActive ? 'border-primary ring-1 ring-primary' : ''
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4 flex flex-col h-full gap-2">
        <div className="flex items-start justify-between">
          <span className="font-bold text-sm leading-tight">{preset.name}</span>
          {preset.tier && (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${tierStyle}`}>
              {preset.tier === 'perf' ? '성능' : preset.tier === 'eff' ? '효율' : preset.tier === 'budg' ? '절약' : preset.tier}
            </Badge>
          )}
        </div>
        {preset.description && (
          <p className="text-xs text-muted-foreground flex-1 line-clamp-2">
            {preset.description}
          </p>
        )}
        <div className="flex flex-wrap gap-1 mt-auto pt-2">
          {preset.providers?.map((provider) => (
            <Badge key={provider} variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
              {provider}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
