// Simple React component for testing
const Component = ({ title, items, showFooter }) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const handleItemClick = (index) => {
    setSelectedIndex(index);
    console.log(`Selected item ${index}: ${items[index]}`);
  };

  return (
    <div className="simple-component">
      <h1>{title || 'Default Title'}</h1>
      
      <ul className="item-list">
        {(items || []).map((item, index) => (
          <li 
            key={index}
            className={selectedIndex === index ? 'selected' : ''}
            onClick={() => handleItemClick(index)}
          >
            {item}
          </li>
        ))}
      </ul>

      {selectedIndex !== null && (
        <div className="selection-info">
          Selected: {items && items[selectedIndex]}
        </div>
      )}

      {showFooter && (
        <footer className="component-footer">
          <p>This is the footer content</p>
        </footer>
      )}
    </div>
  );
};