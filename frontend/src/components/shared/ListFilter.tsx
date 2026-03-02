import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface FilterOption {
  value: string;
  label: string;
}

export interface ListFilterProps {
  /** Text search */
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  /** Dropdown filter (optional) */
  filterOptions?: FilterOption[];
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  filterPlaceholder?: string;

  /** Sort dropdown (optional) */
  sortOptions?: FilterOption[];
  sortValue?: string;
  onSortChange?: (value: string) => void;
  sortPlaceholder?: string;
}

export function ListFilter({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filterOptions,
  filterValue,
  onFilterChange,
  filterPlaceholder = 'Filter',
  sortOptions,
  sortValue,
  onSortChange,
  sortPlaceholder = 'Sort',
}: ListFilterProps) {
  return (
    <div className="p-3 border-b space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 pl-8 text-xs"
        />
      </div>
      {(filterOptions || sortOptions) && (
        <div className="flex gap-2">
          {filterOptions && onFilterChange && (
            <Select value={filterValue ?? ''} onValueChange={onFilterChange}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder={filterPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {filterOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {sortOptions && onSortChange && (
            <Select value={sortValue ?? ''} onValueChange={onSortChange}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder={sortPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}
