import { useState } from 'react';
import { WorkOrderConfig } from './components/WorkOrderConfig';
import { StatSelector } from './components/StatSelector';
import { YieldRates } from './components/YieldRates';
import { ErrDistriHeatmap } from './components/ErrDistriHeatmap';
import { JigTemps } from './components/JigTemps';
import { RpiTemps } from './components/RpiTemps';
import type { WorkOrder } from './components/WorkOrderConfig';

function App() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([
    { model: '', woNumber: '', color: '#000000' },
  ]);
  const [confirmedWorkOrders, setConfirmedWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedStat, setSelectedStat] = useState<string | null>(null);
  const [testStation, setTestStation] = useState<'pt' | 'pts' | 'pdlp'>('pt');
  const [confirmed, setConfirmed] = useState(false);

  const availableStats = [
    'Yield Rate (FPY & Final)',
    'Error Distribution',
    'JIG Temperatures (SOC)',
    'JIG Temperatures (RPI)'
  ];

  return (
    <>
      <WorkOrderConfig
        workOrders={workOrders}
        setWorkOrders={setWorkOrders}
        onConfirm={() => {
          setConfirmedWorkOrders(workOrders);
          setConfirmed(true);
        }}
        testStation={testStation}
        setTestStation={setTestStation}
      />

      <StatSelector
        availableStats={availableStats}
        selectedStat={selectedStat}
        setSelectedStat={setSelectedStat}
      />

      {/* Conditionally render charts only with confirmed workOrders */}
      {confirmed && selectedStat === 'Yield Rate (FPY & Final)' && (
        <YieldRates workOrders={confirmedWorkOrders} testStation={testStation} />
      )}

      {confirmed && selectedStat === 'Error Distribution' && (
        <ErrDistriHeatmap workOrders={confirmedWorkOrders} testStation={testStation} />
      )}

      {confirmed && selectedStat === 'JIG Temperatures (SOC)' && (
        <JigTemps workOrders={confirmedWorkOrders} testStation={testStation} />
      )}

      {confirmed && selectedStat === 'JIG Temperatures (RPI)' && (
        <RpiTemps workOrders={confirmedWorkOrders} testStation={testStation} />
      )}
    </>
  );
}

export default App;
