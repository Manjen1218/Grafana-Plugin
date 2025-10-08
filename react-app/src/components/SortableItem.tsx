import React, { MouseEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Column {
  key: string;
  label: string;
}

interface SortableItemProps {
  col: Column;
  id: string | number;
  onClick?: () => void;
  onRemove?: (id: string | number) => void;
}

const SortableItem: React.FC<SortableItemProps> = React.memo(({ col, id, onClick, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: '6px 10px',
    background: '#333',
    borderRadius: '4px',
    margin: '4px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: 'white',
    userSelect: 'none',
  };

  const handleRemoveClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove(id);
    }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <span style={{ cursor: 'grab', flex: 1 }} {...listeners} onClick={onClick}>
        {col.label}
      </span>
      {onRemove && (
        <button
          onClick={handleRemoveClick}
          style={{
            marginLeft: '10px',
            background: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '16px',
            lineHeight: 1,
          }}
          aria-label={`Remove ${col.label}`}
          type="button"
        >
          ×
        </button>
      )}
    </div>
  );
});

export default SortableItem;
