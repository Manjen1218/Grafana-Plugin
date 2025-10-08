import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import type { WorkOrder } from './WorkOrderConfig';
import annotationPlugin from 'chartjs-plugin-annotation';
import type { AnnotationOptions } from 'chartjs-plugin-annotation';

ChartJS.register(BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend, annotationPlugin);

interface YieldData {
  pass_count: number;
  fail_count: number;
  total_sn: number;
  FPY: string;
  final_yield_rate: string;
}

interface YieldRatesProps {
  workOrders: WorkOrder[];
  testStation: string;
}

export function YieldRates({ workOrders, testStation }: YieldRatesProps) {
  const [yieldResults, setYieldResults] = useState<Record<string, YieldData | null>>({});

  useEffect(() => {
    async function fetchYieldRates() {
      const results: Record<string, YieldData | null> = {};

      await Promise.all(
        workOrders.map(async (wo) => {
          try {
            const url = `http://127.0.0.1:3000/api/yield-rate?wo=${encodeURIComponent(
              wo.woNumber
            )}&ts=${encodeURIComponent(testStation)}&db=${encodeURIComponent(wo.model)}`;
            const res = await fetch(url);
            const data: YieldData[] = await res.json();
            results[wo.woNumber] = data[0] || null;
          } catch (err) {
            console.error(`Failed to fetch yield rate for WO ${wo.woNumber}`, err);
            results[wo.woNumber] = null;
          }
        })
      );

      setYieldResults(results);
    }

    if (workOrders.length > 0) fetchYieldRates();
  }, [workOrders, testStation]);

  const getChartData = (metric: keyof YieldData, label: string) => {
    const labels = workOrders.map((wo) => wo.woNumber);
    const values = workOrders.map((wo) => {
      const data = yieldResults[wo.woNumber];
      return data ? parseFloat(data[metric] as string) : 0;
    });

    return {
      labels,
      datasets: [
        {
          label,
          data: values,
          backgroundColor: workOrders.map((wo) => wo.color || '#007bff'),
        },
      ],
    };
  };

  const chartOptions = (
    title: string,
    metric: 'FPY' | 'final_yield_rate',
    yieldResults: Record<string, YieldData | null>
  ): ChartOptions<'bar'> => {
    const values = Object.values(yieldResults)
      .map((data) => (data ? parseFloat(data[metric]) : null))
      .filter((val): val is number => val !== null && !isNaN(val));

    const minValue = Math.min(...values);
    const yMin = Math.max(0, Math.floor(minValue - 10)); // Clamp at 0

    const thresholdLines: Record<string, AnnotationOptions> =
      metric === 'FPY'
        ? {
            line90: {
              type: 'line',
              yMin: 90,
              yMax: 90,
              borderColor: 'orange',
              borderWidth: 2,
              borderDash: [6, 6],
              label: {
                display: true,
                content: '90%',
                position: 'end',
                color: 'orange',
                backgroundColor: 'rgba(0,0,0,0)',
                yAdjust: -10
              },
            },
            line95: {
              type: 'line',
              yMin: 95,
              yMax: 95,
              borderColor: 'green',
              borderWidth: 2,
              borderDash: [6, 6],
              label: {
                display: true,
                content: '95%',
                position: 'end',
                color: 'green',
                backgroundColor: 'rgba(0,0,0,0)',
                yAdjust: -10
              },
            },
          }
        : {
            line95: {
              type: 'line',
              yMin: 95,
              yMax: 95,
              borderColor: 'orange',
              borderWidth: 2,
              borderDash: [6, 6],
              label: {
                display: true,
                content: '95%',
                position: 'end',
                color: 'orange',
                backgroundColor: 'rgba(0,0,0,0)',
                yAdjust: -10
              },
            },
            line98: {
              type: 'line',
              yMin: 98,
              yMax: 98,
              borderColor: 'green',
              borderWidth: 2,
              borderDash: [6, 6],
              label: {
                display: true,
                content: '98%',
                position: 'end',
                color: 'green',
                backgroundColor: 'rgba(0,0,0,0)',
                yAdjust: -10
              },
            },
          };

    return {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: title,
        },
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.dataset.label || '';
              const woNumber = context.label;
              const data = yieldResults[woNumber];

              if (!data) return `${label}: 0%`;

              const value = context.parsed.y;

              return [
                `${label}: ${value.toFixed(2)}%`,
                `Pass Count: ${data.pass_count}`,
                `Fail Count: ${data.fail_count}`,
                `Total: ${data.total_sn}`,
              ];
            },
          },
        },
        annotation: {
          annotations: thresholdLines,
        },
      },
      scales: {
        y: {
          type: 'linear',
          beginAtZero: false,
          min: yMin,
          max: 100,
          ticks: {
            callback: (value: number | string) => `${value}%`,
          },
        },
        x: {
          type: 'category',
        },
      },
    };
  };

  return (
    <div style={{ width: '95vw', fontFamily: 'Arial', marginTop: '2rem' }}>
      <h2>Yield Rate Charts</h2>
      {Object.keys(yieldResults).length === 0 ? (
        <p>Loading data...</p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '2rem',
            width: '100%',
          }}
        >
          <div
            style={{
              flex: '1 1 45%',
              maxWidth: '45%',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: '100%' }}>
              <Bar
                data={getChartData('FPY', 'First Pass Yield (FPY)')}
                options={chartOptions('First Pass Yield (FPY)', 'FPY', yieldResults)}
              />
            </div>
          </div>

          <div
            style={{
              flex: '1 1 45%',
              maxWidth: '45%',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: '100%' }}>
              <Bar
                data={getChartData('final_yield_rate', 'Final Yield Rate')}
                options={chartOptions('Final Yield Rate', 'final_yield_rate', yieldResults)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
