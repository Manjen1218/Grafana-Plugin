import React from 'react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  type SensorDescriptor,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useTheme2, Input, Card } from '@grafana/ui';
import SortableItem from './SortableItem';

interface Column {
  key: string;
  label: string;
}

interface ColumnConfiguratorProps {
  allColumns: Column[];
  visibleColumnKeys: string[];
  filteredCols: Column[];
  handleAddColumn: (key: string) => void;
  handleRemoveColumn: (key: string) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  sensors?: SensorDescriptor<any>[];
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
}

const ColumnConfigurator: React.FC<ColumnConfiguratorProps> = ({
  allColumns,
  visibleColumnKeys,
  filteredCols,
  handleAddColumn,
  handleRemoveColumn,
  handleDragEnd,
  sensors,
  searchTerm,
  setSearchTerm,
}) => {
  const theme = useTheme2();

  return (
    <div
      style={{
        display: 'flex',
        gap: theme.spacing(3),
        marginBottom: theme.spacing(3),
        height: 300,
      }}
    >
      {/* Left Panel - Available Columns */}
      <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Input
          placeholder="Search columns..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filteredCols.length > 0) {
              handleAddColumn(filteredCols[0].key);
              setSearchTerm('');
            }
          }}
        />

        <div style={{ flex: 1, padding: theme.spacing(1), overflowY: 'auto' }}>
          {filteredCols.map((col) => (
            <SortableItem
              key={col.key}
              col={col}
              id={col.key}
              onClick={() => handleAddColumn(col.key)}
            />
          ))}
        </div>
      </Card>

      {/* Right Panel - Visible Columns */}
      <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
         <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleColumnKeys} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'flex', flexDirection: 'column', padding: theme.spacing(1) }}>
              {visibleColumnKeys.map((key) => {
                const col = allColumns.find((c) => c.key === key);
                if (!col) return null;

                return (
                  <SortableItem
                    key={key}
                    id={key}
                    col={col}
                    onRemove={() => handleRemoveColumn(key)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </Card>
    </div>
  );
};

export default ColumnConfigurator;
