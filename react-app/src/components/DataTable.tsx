import React, { useMemo, MouseEvent } from 'react';
import { useTheme2, Text } from '@grafana/ui';

interface Column {
  key: string;
  label: string;
}

interface DataTableProps {
  download: string;
  db: string;
  rows: Array<Record<string, any>>;
  visibleCols: Column[];
  colWidths: Record<string, number>;
  initResize: (e: MouseEvent<HTMLDivElement>, columnKey: string) => void;
  queryString: string;
}

const EDGE_THRESHOLD = 10;

const DataTable: React.FC<DataTableProps> = ({
  download,
  db,
  rows,
  visibleCols,
  colWidths,
  initResize,
  queryString,
}) => {
  const theme = useTheme2();

  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = {};
    visibleCols.forEach((col) => {
      widths[col.key] = colWidths[col.key] || 150;
    });
    return widths;
  }, [visibleCols, colWidths]);

  return (
    <div
      style={{
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.shape.borderRadius(1),
        overflow: 'auto',
        maxHeight: '60vh'
      }}
    >
      <table
        style={{
          width: '100%',
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
        }}
      >
        <thead>
          <tr style={{ background: theme.colors.background.secondary }}>
            {visibleCols.map((col) => {
              const width = columnWidths[col.key];
              return (
                <th
                  key={col.key}
                  style={{
                    width,
                    padding: '8px 12px',
                    borderBottom: `1px solid ${theme.colors.border.medium}`,
                    userSelect: 'none',
                    textAlign: 'left',
                    position: 'sticky', // Needed for absolute positioning of handle
                    zIndex: 1
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      height: '100%',
                      width: '100%',
                      paddingRight: EDGE_THRESHOLD,
                    }}
                  >
                    <Text weight="medium">{col.label}</Text>
                  </div>
                  <div
                    onMouseDown={(e) => initResize(e as unknown as MouseEvent<HTMLDivElement>, col.key)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      width: '6px',
                      height: '100%',
                      cursor: 'col-resize',
                      zIndex: 1,
                    }}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ridx) => {
            const isCrossWo = row['Cross_Wo'] === true || row['Cross_Wo'] === 'True';

            return (
              <tr
                key={ridx}
                style={{
                  backgroundColor: isCrossWo ? theme.colors.warning.text : undefined,
                  borderBottom: `1px solid ${theme.colors.border.weak}`,
                }}
              >
                {visibleCols.map((col) => {
                  const width = columnWidths[col.key];
                  const cellStyle = {
                    padding: '6px 12px',
                    width,
                    fontSize: theme.typography.size.sm,
                    wordBreak: 'break-word' as const,
                  };

                  if (col.key === 'bname') {
                    const bname = row.bname ?? '';
                    const dateUTC = row.tbeg ?? '';

                    // Convert UTC to UTC-8 by subtracting 8 hours
                    const date = new Date(dateUTC);
                    date.setHours(date.getHours() + 8);
                    // Build ISO-like string manually (UTC-8 time, but still formatted like ISO)
                    const pad = (n: number) => n.toString().padStart(2, '0');
                    const dateString = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.000Z`;

                    const urlParams = new URLSearchParams(window.location.search);
                    const sku = urlParams.get('db') ?? '';
                    const ts = urlParams.get('table') ?? '';
                    const name = bname;

                    const query = new URLSearchParams({ sku, ts, date: dateString, name }).toString();

                    return (
                      <td key={col.key} style={cellStyle}>
                        <a
                          href={`/a/logviewer-app/?${query}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: theme.colors.primary.text,
                            textDecoration: 'underline',
                          }}
                        >
                          {bname}
                        </a>
                      </td>
                    );
                  }
                  if (col.key === 'mcc_bname') {
                    const fullpath = row.fullpath ?? '';
                  
                    let transformedPath = fullpath
                      // replace the root
                      .replace(/^\/your\/folder\//, '/home/template/remote_mount/')
                      // insert -MCC after the table folder (PT → PT-MCC, PTS → PTS-MCC, etc.)
                      .replace(/\/(Station1|Station2|Station3)(?=\/)/i, '/$1-MCC')
                      // change extension
                      .replace(/\.cap$/i, '.mcc');

                    const bname = transformedPath.split('/').pop() ?? '';
                  
                    return (
                      <td key={col.key} style={cellStyle}>
                        <a
                          href={`http://localhost:3000/view-file?path=${encodeURIComponent(transformedPath)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: theme.colors.primary.text,
                            textDecoration: 'underline',
                          }}
                        >
                          {bname}
                        </a>
                      </td>
                    );
                  }                  
                  if (col.key === 'sn') {
                    const sn = row.sn;
                    return (
                      <td key={col.key} style={cellStyle}>
                        <a
                          href={`/d/yuor-link/sn-history?var-sku_filter=${db}&var-sn_filter=${sn}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: theme.colors.primary.text,
                            textDecoration: 'underline',
                          }}
                        >
                          {sn}
                        </a>
                      </td>
                    );
                  }

                  if (col.key === 'key1' || col.key === 'key2' || col.key === 'key3' || col.key === 'key4') {
                    const rawTime = row[col.key];
                    const localTime = rawTime
                      ? (() => {
                          const d = new Date(rawTime); // Assume rawTime is in UTC
                          d.setHours(d.getHours() + 8);
                          const pad = (n: number) => n.toString().padStart(2, '0');
                          return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
                        })()
                      : '';

                    return (
                      <td key={col.key} style={cellStyle}>
                        {localTime}
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} style={cellStyle}>
                      {row[col.key]}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
