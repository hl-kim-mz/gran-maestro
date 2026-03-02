import React from 'react';

interface ResizableHandleProps {
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

export const ResizableHandle: React.FC<ResizableHandleProps> = ({
  isResizing,
  onMouseDown,
}) => {
  return (
    <div
      className="group w-1 h-full shrink-0 select-none cursor-col-resize bg-transparent hover:bg-primary/10 transition-colors duration-200"
      onMouseDown={onMouseDown}
    >
      <div
        className={`w-0.5 h-full mx-auto transition-colors duration-200 ${
          isResizing
            ? 'bg-primary'
            : 'bg-border group-hover:bg-primary'
        }`}
      />
    </div>
  );
};
