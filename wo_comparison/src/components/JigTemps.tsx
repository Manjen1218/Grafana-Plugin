import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import type { WorkOrder } from './WorkOrderConfig';

interface JigTempData {
  jig: string;
  station: string;
  pass_count: number;
  fail_count: number;
  fail_percentage: string;
  ave_temp: number;
  max_temp: number;
}

interface JigTempsProps {
  workOrders: WorkOrder[];
  testStation: 'station1' | 'station2' | 'station3';
}

// Utility to darken/lighten color by a percent
function shadeColor(color: string, percent: number): string {
  const f = parseInt(color.slice(1), 16);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const R = f >> 16;
  const G = (f >> 8) & 0x00ff;
  const B = f & 0x0000ff;

  return (
    '#' +
    (
      0x1000000 +
      (Math.round((t - R) * p) + R) * 0x10000 +
      (Math.round((t - G) * p) + G) * 0x100 +
      (Math.round((t - B) * p) + B)
    )
      .toString(16)
      .slice(1)
  );
}

export const JigTemps: React.FC<JigTempsProps> = ({ workOrders, testStation }) => {
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false);
  const [averageAveTemp, setAverageAveTemp] = useState<number | null>(null);

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);

      try {
        const resultsByJig: Record<string, any> = {};

        for (const wo of workOrders) {
          const res = await fetch(
            `http://127.0.0.1:3000/api/jig_temps?wo='${wo.woNumber}'&ts='${testStation}'&db=${wo.model}`
          );
          const json = await res.json();

          const jigResults: JigTempData[] = json[0];

          jigResults.forEach((jig) => {
            if (!resultsByJig[jig.jig]) {
              resultsByJig[jig.jig] = { jig: jig.jig };
            }

            const ave = jig.ave_temp;
            const max = jig.max_temp;
            const delta = Math.max(0, max - ave); // ensure non-negative delta

            resultsByJig[jig.jig][`${wo.woNumber}_ave`] = ave;
            resultsByJig[jig.jig][`${wo.woNumber}_delta`] = delta;
          });
        }

        const allAveTemps: number[] = [];

        Object.values(resultsByJig).forEach((jigData: any) => {
          Object.keys(jigData).forEach((key) => {
            if (key.endsWith('_ave')) {
              allAveTemps.push(jigData[key]);
            }
          });
        });

        const average =
          allAveTemps.length > 0
            ? allAveTemps.reduce((sum, val) => sum + val, 0) / allAveTemps.length
            : null;

        setAverageAveTemp(average);
        setData(Object.values(resultsByJig));
      } catch (error) {
        console.error('Error fetching jig temperatures:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [workOrders, testStation]);

  if (loading) {
    return <div>Loading jig temperatures...</div>;
  }

  return (
    <div style={{ width: '90vw', height: '100vh' }}>
      <h3>JIG Temperatures (Stacked: Average + Max)</h3>

      <div style={{ width: '100%', height: '90vh', overflowY: 'auto' }}>
        <div style={{ height: data.length * 40 || 800, minHeight: '800px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 20, right: 50, left: 150, bottom: 80 }}
              barCategoryGap={8}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                label={{
                  value: 'Temperature (°C)',
                  position: 'insideBottomRight',
                  offset: -10,
                }}
              />
              <YAxis type="category" dataKey="jig" width={150} />
              <Tooltip />
              <Legend />

              {workOrders.map((wo) => {
                const baseColor = wo.color || '#8884d8';
                const deltaColor = shadeColor(baseColor, -20);

                return (
                  <React.Fragment key={wo.woNumber}>
                    <Bar
                      dataKey={`${wo.woNumber}_ave`}
                      fill={baseColor}
                      name={`${wo.woNumber} Avg Temp`}
                      stackId={wo.woNumber}
                      barSize={20}
                    />
                    <Bar
                      dataKey={`${wo.woNumber}_delta`}
                      fill={deltaColor}
                      name={`${wo.woNumber} Max Temp Δ`}
                      stackId={wo.woNumber}
                      barSize={20}
                    />
                  </React.Fragment>
                );
              })}

              {averageAveTemp && (
              <ReferenceLine
                x={averageAveTemp}
                stroke="red"
                strokeDasharray="4 4"
                label={{
                  value: `Avg Ave Temp: ${averageAveTemp.toFixed(1)}°C`,
                  position: 'top',
                  fill: 'red',
                  fontSize: 12,
                }}
              />
            )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
