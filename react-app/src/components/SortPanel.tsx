import React from 'react';
import { Button, Select, InlineFieldRow, InlineField, useTheme2 } from '@grafana/ui';

interface Column {
  key: string;
  label: string;
}

interface SortColumn {
  key: string;
  direction: 'asc' | 'desc';
}

interface SortPanelProps {
  sortColumns: SortColumn[];
  visibleCols: Column[];
  updateSortColumn: (index: number, updated: Partial<SortColumn>) => void;
  removeSortColumn: (index: number) => void;
  handleAddSortColumn: () => void;
}

const SortPanel: React.FC<SortPanelProps> = ({
  sortColumns,
  visibleCols,
  updateSortColumn,
  removeSortColumn,
  handleAddSortColumn,
}) => {
  const theme = useTheme2();

  const directionOptions = [
    { label: '↑ Ascending', value: 'asc' },
    { label: '↓ Descending', value: 'desc' },
  ];

  const columnOptions = visibleCols.map((col) => ({
    label: col.label,
    value: col.key,
  }));

  return (
    <div style={{ marginBottom: theme.spacing(3) }}>
      <h3 style={{ marginBottom: theme.spacing(1) }}>Sort By</h3>

      {sortColumns.map((sort, idx) => (
        <InlineFieldRow key={idx}>
          <InlineField label="Column">
            <Select
              options={columnOptions}
              value={columnOptions.find((opt) => opt.value === sort.key)}
              onChange={(v) => updateSortColumn(idx, { key: v.value! })}
              width={25}
            />
          </InlineField>

          <InlineField label="Direction">
            <Select
              options={directionOptions}
              value={directionOptions.find((opt) => opt.value === sort.direction)}
              onChange={(v) => updateSortColumn(idx, { direction: v.value! as 'asc' | 'desc' })}
              width={20}
            />
          </InlineField>

          {/* Wrap button in a div to align it nicely */}
          <InlineField grow>
            <Button
              variant="destructive"
              icon="times"
              onClick={() => removeSortColumn(idx)}
            >
              Remove
            </Button>
          </InlineField>
        </InlineFieldRow>
      ))}

      <div style={{ marginTop: theme.spacing(2) }}>
        <Button variant="primary" icon="plus" onClick={handleAddSortColumn}>
          Add Sort Column
        </Button>
      </div>
    </div>
  );
};

export default SortPanel;
