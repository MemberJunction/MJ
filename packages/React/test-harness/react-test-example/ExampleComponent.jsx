// Example React Component
const Component = ({ name, count, showDetails }) => {
  const [clickCount, setClickCount] = React.useState(0);

  const handleClick = () => {
    setClickCount(clickCount + 1);
  };

  return (
    <div className="example-component">
      <h1>Hello, {name || 'World'}!</h1>
      <p>Count: {count || 0}</p>
      <button onClick={handleClick}>
        Clicked {clickCount} times
      </button>
      {showDetails && (
        <div className="details">
          <p>This is additional detail content.</p>
        </div>
      )}
    </div>
  );
};