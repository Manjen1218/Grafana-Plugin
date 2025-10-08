import React from 'react';

interface StatSelectorProps {
  availableStats: string[];
  selectedStat: string | null;
  setSelectedStat: React.Dispatch<React.SetStateAction<string | null>>;
}

export const StatSelector: React.FC<StatSelectorProps> = ({
  availableStats,
  selectedStat,
  setSelectedStat,
}) => {
  const selectStat = (stat: string) => {
    // If clicked stat is already selected, deselect it (optional)
    if (selectedStat === stat) {
      setSelectedStat(null);
    } else {
      setSelectedStat(stat);
    }
  };

  return (
    <div style={{ maxWidth: '95vw'}}>
      <h3>Select Stat</h3>
      {availableStats.map((stat) => (
        <button
          key={stat}
          onClick={() => selectStat(stat)}
          style={{
            marginRight: '0.5rem',
            backgroundColor: selectedStat === stat ? '#4caf50' : '#e0e0e0',
            color: selectedStat === stat ? 'white' : 'black',
            border: '1px solid #ccc',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
          }}
        >
          {stat}
        </button>
      ))}
    </div>
  );
};
