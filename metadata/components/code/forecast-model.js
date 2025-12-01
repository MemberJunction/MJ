// ForecastModel Sub-component
function ForecastModel ({ forecastData, scenarios, onScenarioChange, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [activeTab, setActiveTab] = useState('forecast');
  const [selectedScenario, setSelectedScenario] = useState(scenarios?.[0]?.id || '');

  const handleScenarioChange = (scenarioId) => {
    setSelectedScenario(scenarioId);
    if (onScenarioChange) {
      onScenarioChange(scenarioId);
    }
  };

  return (
    <div
      className="forecastmodel-panel"
      style={{
        width: '100%',
        height: '400px',
        backgroundColor: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <div style={{
        padding: '20px',
        borderBottom: '1px solid #e0e0e0',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0 }}>Forecast Model</h3>
        {scenarios && scenarios.length > 1 && (
          <select
            value={selectedScenario}
            onChange={(e) => handleScenarioChange(e.target.value)}
            style={{
              padding: '5px 10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: '#fff'
            }}
          >
            {scenarios.map(scenario => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {!forecastData || forecastData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            No forecast data available
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Forecast Periods</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {forecastData.map((item, index) => (
                  <div key={index} style={{
                    padding: '12px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '4px',
                    backgroundColor: '#f9f9f9'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
                        {item.period}
                      </span>
                      <span style={{ fontSize: '16px', fontWeight: '700', color: '#007bff' }}>
                        ${item.value?.toLocaleString() || '0'}
                      </span>
                    </div>
                    {item.confidence && (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                        Confidence Range: ${item.confidence.low?.toLocaleString() || '0'} - ${item.confidence.high?.toLocaleString() || '0'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {scenarios && selectedScenario && (
              <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f0f7ff', borderRadius: '4px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#0066cc' }}>Selected Scenario</h4>
                {scenarios.find(s => s.id === selectedScenario) && (
                  <div>
                    <div style={{ fontSize: '14px', color: '#333', marginBottom: '5px' }}>
                      <strong>{scenarios.find(s => s.id === selectedScenario).name}</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Growth Rate: {scenarios.find(s => s.id === selectedScenario).parameters.growth * 100}%
                      {scenarios.find(s => s.id === selectedScenario).parameters.seasonality && ' (with seasonality)'}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}