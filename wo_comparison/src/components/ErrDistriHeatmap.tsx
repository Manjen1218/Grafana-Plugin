import React, { useEffect, useState } from 'react';
import type { WorkOrder } from './WorkOrderConfig';
import { Tooltip as ReactTooltip } from 'react-tooltip';

interface ErrDistriHeatmapProps {
  workOrders: WorkOrder[];
  testStation: 'station1' | 'station2' | 'station3';
}

interface ErrorData {
  err_id: string;
  err_msg: string;
  count: number;
  percent: string; // originally string in JSON
}

type WorkOrderErrorMap = Record<string, number>; // errKey -> percent (number)

export function ErrDistriHeatmap({ workOrders, testStation }: ErrDistriHeatmapProps) {
  const [matrix, setMatrix] = useState<number[][]>([]);
  const [xLabels, setXLabels] = useState<string[]>([]);
  const [yLabels, setYLabels] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const allErrorMaps: WorkOrderErrorMap[] = [];
      const allErrorsSet = new Set<string>();
      const xLabelsTemp: string[] = [];

      for (const wo of workOrders) {
        const queryURL = `http://127.0.0.1:3000/api/err_distribution?wo='${encodeURIComponent(wo.woNumber)}'&ts=${testStation}&db=${wo.model}`;
        try {
          const res = await fetch(queryURL);
          const [data]: [ErrorData[]] = await res.json();

          const errorMap: WorkOrderErrorMap = {};
          data.forEach((err) => {
            const errKey = `${err.err_id}: ${err.err_msg}`;
            errorMap[errKey] = parseFloat(err.percent);
            allErrorsSet.add(errKey);
          });

          allErrorMaps.push(errorMap);
          xLabelsTemp.push(wo.woNumber);
        } catch (err) {
          console.error(`Error fetching data for WO ${wo.woNumber}`, err);
          allErrorMaps.push({});
          xLabelsTemp.push(wo.woNumber);
        }
      }

      const allErrorsArray = Array.from(allErrorsSet).sort();

      const matrixData: number[][] = allErrorsArray.map((errKey) => allErrorMaps.map((errorMap) =>
         errorMap[errKey] || 0)
      );

      setMatrix(matrixData);
      setXLabels(xLabelsTemp);
      setYLabels(allErrorsArray);
    };

    fetchData();
  }, [workOrders, testStation]);

  const maxValue = Math.max(...matrix.flat());

  return (
  <div style={{
    fontFamily: 'Arial',
    marginTop: '2rem',
    maxWidth: '95vw',
    overflow: 'auto',
  }}>
    <h2>Error Distribution Heatmap</h2>
    <div
      style={{
        border: '1px solid #ccc',
        borderRadius: '8px',
        boxShadow: '0 0 10px rgba(0, 0, 0, 0.4)',
        padding: '1rem',
        maxHeight: '500px',
        overflow: 'auto',
        background: '#ffffffff',
      }}
    >
      {matrix.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingRight: '1rem', fontWeight: 'normal' }}></th>
                {xLabels.map((label, i) => (
                  <th key={i} style={{ fontSize: '0.8rem', padding: '0.25rem', textAlign: 'center', color: 'black', fontWeight: 'normal' }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, rowIndex) => (
                <tr key={rowIndex}>
                    <td
                        style={{
                            position: 'sticky',
                            left: 0,
                            background: 'transparent',
                            color: 'black',
                            zIndex: 1,
                            fontSize: '0.85rem',
                            paddingRight: '0.5rem',
                            textAlign: 'left',
                            borderRight: '1px solid #ccc',
                            whiteSpace: 'nowrap',
                        }}
                        >
                        <span
                          data-tooltip-id={`tooltip-${rowIndex}`}
                          data-tooltip-content={yLabels[rowIndex]}
                          style={{
                            cursor: 'help',
                            display: 'inline-block',
                            maxWidth: '200px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {yLabels[rowIndex].length > 20
                            ? yLabels[rowIndex].slice(0, 20) + '…'
                            : yLabels[rowIndex]}
                        </span>

                        <ReactTooltip
                          id={`tooltip-${rowIndex}`}
                          place="right"
                          style={{ whiteSpace: 'normal', maxWidth: '300px' }}
                        />
                    </td>
                    {row.map((value, colIndex) => {
                    const opacity = maxValue > 0 ? value / maxValue : 0;
                    const bgColor = opacity > 0 ? `rgba(255, 0, 0, ${opacity})`: 'white';
                    const textColor = value > maxValue * 0.3 ? 'white' : 'black';

                    return (
                        <td
                        key={colIndex}
                        style={{
                            background: bgColor,
                            color: textColor,
                            textAlign: 'center',
                            width: '40px',
                            height: '40px',
                            fontSize: '0.75rem',
                            border: '1px solid #ccc',
                            verticalAlign: 'middle',
                            lineHeight: '40px',
                          }}
                        >
                        {value > 0 ? `${value.toFixed(2)}%` : '0%'}
                        </td>
                    );
                    })}
                </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{color: 'black'}}>Loading heatmap data...</p>
      )}
    </div>
  </div>
  );
}
