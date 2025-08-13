## Entity Browser Requirements

### Core Functionality
- Display entities in a responsive grid or card layout based on user preference
- Allow users to select view mode (grid vs card)
- Click on an entity to slide in a details panel from the right
- Show entity metadata including fields and relationships in the details panel
- Provide a collapsible filter panel on the left side
- Support sorting by multiple fields with visual indicators
- Include a search bar for quick entity filtering
- Provide an 'Open' button to trigger the OpenEntityRecord callback
- Remember user's last selected entity and view preferences

### UX Considerations
- Smooth animations for panel transitions
- Responsive design that works on different screen sizes
- Loading states while fetching data
- Empty states with helpful messages
- Keyboard navigation support (arrow keys, tab, enter)
- Visual feedback for hover and selection states
- Maintain scroll position when switching between entities