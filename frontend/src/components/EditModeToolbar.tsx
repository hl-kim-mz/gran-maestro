import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type ItemType = "request" | "plan" | "session"

interface EditModeToolbarProps {
  isEditMode: boolean
  selectedIds: string[]
  itemType: ItemType
  isBackingUp?: boolean
  onToggleEditMode: () => void
  onStatusChange: (targetStatus: string) => void
  onBackup: () => void
  onCancel: () => void
}

const ALLOWED_STATUSES: Record<ItemType, string[]> = {
  request: ["completed", "cancelled"],
  plan: ["completed"],
  session: ["completed"],
}

export function EditModeToolbar({
  isEditMode,
  selectedIds,
  itemType,
  isBackingUp = false,
  onToggleEditMode,
  onStatusChange,
  onBackup,
  onCancel,
}: EditModeToolbarProps) {
  if (!isEditMode) {
    return (
      <Button variant="outline" size="sm" onClick={onToggleEditMode}>
        편집
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md border">
      <span className="text-sm text-muted-foreground">
        {selectedIds.length}개 선택됨
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
          >
            상태 변경 <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {selectedIds.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              항목을 먼저 선택하세요
            </div>
          ) : (
            ALLOWED_STATUSES[itemType].map((s) => (
              <DropdownMenuItem key={s} onClick={() => onStatusChange(s)}>
                {s}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        variant="outline"
        disabled={selectedIds.length === 0 || isBackingUp}
        onClick={onBackup}
      >
        {isBackingUp ? "백업 중..." : "백업"}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        취소
      </Button>
    </div>
  )
}
