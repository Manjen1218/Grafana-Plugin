import { useState, useEffect } from 'react';

export interface WorkOrder {
  model: string;
  woNumber: string;
  color: string;
}

interface WorkOrderConfigProps {
  workOrders: WorkOrder[];
  setWorkOrders: React.Dispatch<React.SetStateAction<WorkOrder[]>>;
  onConfirm: () => void;
  testStation: 'pt' | 'pts' | 'pdlp';
  setTestStation: React.Dispatch<React.SetStateAction<'pt' | 'pts' | 'pdlp'>>;
}

interface SkuResponse {
  skus: string[];
}

interface SuggestionListProps {
  options: string[];
  onSelect: (value: string) => void;
}

const suggestionListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: '0.25rem 0 0',
  position: 'absolute',
  backgroundColor: 'white',
  border: '1px solid #ccc',
  width: '100%',
  maxHeight: 150,
  overflowY: 'auto',
  zIndex: 10,
  color: 'black'
};

const SuggestionList = ({ options, onSelect }: SuggestionListProps) => (
  <ul style={suggestionListStyle}>
    {options.slice(0, 5).map((option) => (
      <li
        key={option}
        onClick={() => onSelect(option)}
        style={{ padding: '0.5rem', cursor: 'pointer' }}
      >
        {option}
      </li>
    ))}
  </ul>
);

export function WorkOrderConfig({
  workOrders,
  setWorkOrders,
  onConfirm,
  testStation,
  setTestStation,
}: WorkOrderConfigProps) {
  const [skuOptions, setSkuOptions] = useState<string[]>([]);
  const [woOptionsPerRow, setWoOptionsPerRow] = useState<string[][]>([]);
  const [showSkuSuggestions, setShowSkuSuggestions] = useState<boolean[]>([]);
  const [showWoSuggestions, setShowWoSuggestions] = useState<boolean[]>([]);
  const [confirmationMessage, setConfirmationMessage] = useState('');

  useEffect(() => {
    fetch('http://127.0.0.1:3000/databases')
      .then((res) => res.json())
      .then((data: SkuResponse) => setSkuOptions(data.skus))
      .catch((error) => console.error('Failed to fetch SKUs:', error));
  }, []);

  const fetchWoOptions = async (sku: string, index: number) => {
    try {
      const res = await fetch(`http://127.0.0.1:3000/wo?db=${sku}&ts=${testStation}`);
      const data: { wo: string }[] = await res.json();
      setWoOptionsPerRow((prev) => {
        const updated = [...prev];
        updated[index] = data.map((item) => item.wo);
        return updated;
      });
    } catch (error) {
      console.error('Failed to fetch WOs:', error);
    }
  };

  const handleInputChange = (
    index: number,
    field: keyof WorkOrder,
    value: string
  ) => {
    setWorkOrders((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddWorkOrder = () => {
    setWorkOrders((prev) => [...prev, { model: '', woNumber: '', color: '#000000' }]);
    setShowSkuSuggestions((prev) => [...prev, false]);
    setShowWoSuggestions((prev) => [...prev, false]);
    setWoOptionsPerRow((prev) => [...prev, []]);
  };

  const handleSuggestionToggle = (
    setter: React.Dispatch<React.SetStateAction<boolean[]>>,
    index: number,
    value: boolean
  ) => {
    setter((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleRemoveWorkOrder = (index: number) => {
    setWorkOrders((prev) => prev.filter((_, i) => i !== index));
    setShowSkuSuggestions((prev) => prev.filter((_, i) => i !== index));
    setShowWoSuggestions((prev) => prev.filter((_, i) => i !== index));
    setWoOptionsPerRow((prev) => prev.filter((_, i) => i !== index));
  };

  const inputContainerStyle: React.CSSProperties = { position: 'relative', marginBottom: '0.75rem' };
  const workOrderCardStyle: React.CSSProperties = { marginBottom: '1rem', padding: '1rem', border: '1px solid #ccc' };

  return (
    <div className="work-order-config" style={{ maxWidth: '95vw' }}>
      <h2>Work Order Configuration</h2>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="ts-select">Select Test Station: </label>
        <select
          id="ts-select"
          value={testStation}
          onChange={(e) => setTestStation(e.target.value as 'pt' | 'pts' | 'pdlp')}
        >
          <option value="pt">pt</option>
          <option value="pts">pts</option>
          <option value="pdlp">pdlp</option>
        </select>
      </div>

      {workOrders.map((wo, index) => {
        const filteredSkus = skuOptions.filter((sku) =>
          sku.toLowerCase().includes(wo.model.toLowerCase())
        );

        const filteredWos = woOptionsPerRow[index]?.filter((woOption) =>
          woOption.toLowerCase().includes(wo.woNumber.toLowerCase())
        ) || [];

        return (
          <div key={index} style={workOrderCardStyle}>
            {/* SKU Field */}
            <div style={inputContainerStyle}>
              <label>SKU: </label>
              <input
                type="text"
                value={wo.model}
                onChange={(e) => {
                  handleInputChange(index, 'model', e.target.value);
                  handleSuggestionToggle(setShowSkuSuggestions, index, true);
                }}
                onFocus={() => handleSuggestionToggle(setShowSkuSuggestions, index, true)}
                onBlur={() => setTimeout(() => handleSuggestionToggle(setShowSkuSuggestions, index, false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredSkus.length > 0) {
                    e.preventDefault();
                    handleInputChange(index, 'model', filteredSkus[0]);
                    handleSuggestionToggle(setShowSkuSuggestions, index, false);
                    fetchWoOptions(filteredSkus[0], index);
                  }
                }}
                placeholder="Type to search..."
                autoComplete="off"
              />
              {showSkuSuggestions[index] && wo.model && filteredSkus.length > 0 && (
                <SuggestionList
                  options={filteredSkus}
                  onSelect={(val) => {
                    handleInputChange(index, 'model', val);
                    fetchWoOptions(val, index);
                    handleSuggestionToggle(setShowSkuSuggestions, index, false);
                  }}
                />
              )}
            </div>

            {/* Work Order Field */}
            <div style={inputContainerStyle}>
              <label>Work Order #: </label>
              <input
                type="text"
                value={wo.woNumber}
                onChange={(e) => {
                  handleInputChange(index, 'woNumber', e.target.value);
                  handleSuggestionToggle(setShowWoSuggestions, index, true);
                }}
                onFocus={() => handleSuggestionToggle(setShowWoSuggestions, index, true)}
                onBlur={() => setTimeout(() => handleSuggestionToggle(setShowWoSuggestions, index, false), 150)}
                placeholder="Select WO..."
                autoComplete="off"
              />
              {showWoSuggestions[index] && wo.woNumber && filteredWos.length > 0 && (
                <SuggestionList
                  options={filteredWos}
                  onSelect={(val) => {
                    handleInputChange(index, 'woNumber', val);
                    handleSuggestionToggle(setShowWoSuggestions, index, false);
                  }}
                />
              )}
            </div>

            {/* Color Picker */}
            <div>
              <label>Color: </label>
              <input
                type="color"
                value={wo.color}
                onChange={(e) => handleInputChange(index, 'color', e.target.value)}
              />
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <button onClick={() => handleRemoveWorkOrder(index)} style={{ color: 'red' }}>
                Remove
              </button>
            </div>
          </div>
        );
      })}

      {/* Buttons container */}
      <div style={{ marginTop: '1rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button onClick={handleAddWorkOrder}>Add Work Order</button>

          <button
            onClick={() => {
              onConfirm();
              setConfirmationMessage('Work Orders confirmed.');
              setTimeout(() => setConfirmationMessage(''), 3000);
            }}
            style={{
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
            }}
          >
            Confirm Work Orders
          </button>
        </div>

        {confirmationMessage && (
          <div style={{ marginTop: '1rem', color: 'green', fontWeight: 500 }}>
            {confirmationMessage}
          </div>
        )}
      </div>
    </div>
  );
}
