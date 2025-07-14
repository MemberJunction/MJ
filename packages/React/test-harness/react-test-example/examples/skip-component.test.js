import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SkipStyleComponent } from './SkipStyleComponent.jsx';

describe('SkipStyleComponent', () => {
  // Mock data following Skip component data structure
  const mockData = {
    title: 'Test Dashboard',
    description: 'This is a test dashboard component',
    items: [
      { id: 1, name: 'Item 1', description: 'First item', category: 'category1', value: 100 },
      { id: 2, name: 'Item 2', description: 'Second item', category: 'category2', value: 200 },
      { id: 3, name: 'Item 3', description: 'Third item', category: 'category1', value: 150 },
      { id: 4, name: 'Item 4', description: 'Fourth item', category: 'category2', value: 250 }
    ],
    summary: 'This dashboard shows 4 items across 2 categories'
  };

  // Mock userState
  const mockUserState = {
    viewMode: 'list',
    activeFilter: 'all'
  };

  // Mock callbacks
  const mockCallbacks = {
    RefreshData: jest.fn(),
    UpdateUserState: jest.fn()
  };

  // Mock utilities
  const mockUtilities = {
    logEvent: jest.fn(),
    formatDate: jest.fn((date) => new Date(date).toLocaleDateString())
  };

  // Mock styles
  const mockStyles = {
    container: { backgroundColor: '#f0f0f0' },
    header: { color: '#333' },
    button: { backgroundColor: '#e0e0e0' },
    item: { boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }
  };

  // Default props
  const defaultProps = {
    data: mockData,
    userState: mockUserState,
    callbacks: mockCallbacks,
    utilities: mockUtilities,
    styles: mockStyles
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Data Rendering', () => {
    test('renders component title and description from data prop', () => {
      render(<SkipStyleComponent {...defaultProps} />);
      
      expect(screen.getByText('Test Dashboard')).toBeInTheDocument();
      expect(screen.getByText('This is a test dashboard component')).toBeInTheDocument();
    });

    test('renders all data items when no filter is applied', () => {
      render(<SkipStyleComponent {...defaultProps} />);
      
      expect(screen.getByTestId('item-1')).toBeInTheDocument();
      expect(screen.getByTestId('item-2')).toBeInTheDocument();
      expect(screen.getByTestId('item-3')).toBeInTheDocument();
      expect(screen.getByTestId('item-4')).toBeInTheDocument();
      
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Value: 100')).toBeInTheDocument();
    });

    test('renders summary section when data.summary is provided', () => {
      render(<SkipStyleComponent {...defaultProps} />);
      
      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(screen.getByText('This dashboard shows 4 items across 2 categories')).toBeInTheDocument();
      expect(screen.getByText('Total Items: 4 / 4')).toBeInTheDocument();
    });

    test('shows empty state when no items are available', () => {
      const propsWithNoItems = {
        ...defaultProps,
        data: { ...mockData, items: [] }
      };
      
      render(<SkipStyleComponent {...propsWithNoItems} />);
      
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText(/No items to display/)).toBeInTheDocument();
    });

    test('filters items based on userState.activeFilter', () => {
      const propsWithFilter = {
        ...defaultProps,
        userState: { ...mockUserState, activeFilter: 'category1' }
      };
      
      render(<SkipStyleComponent {...propsWithFilter} />);
      
      expect(screen.getByTestId('item-1')).toBeInTheDocument();
      expect(screen.getByTestId('item-3')).toBeInTheDocument();
      expect(screen.queryByTestId('item-2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('item-4')).not.toBeInTheDocument();
      
      expect(screen.getByText('Total Items: 2 / 4')).toBeInTheDocument();
    });
  });

  describe('Callback Invocations', () => {
    test('calls RefreshData callback when refresh button is clicked', async () => {
      render(<SkipStyleComponent {...defaultProps} />);
      
      const refreshButton = screen.getByTestId('refresh-button');
      fireEvent.click(refreshButton);
      
      await waitFor(() => {
        expect(mockCallbacks.RefreshData).toHaveBeenCalledTimes(1);
      });
    });

    test('shows loading state during refresh', async () => {
      mockCallbacks.RefreshData.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      
      render(<SkipStyleComponent {...defaultProps} />);
      
      const refreshButton = screen.getByTestId('refresh-button');
      fireEvent.click(refreshButton);
      
      // Check for loading button text
      expect(screen.getByTestId('refresh-button')).toHaveTextContent('Loading...');
      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
      });
    });

    test('calls UpdateUserState with new viewMode when toggle button is clicked', () => {
      render(<SkipStyleComponent {...defaultProps} />);
      
      const toggleButton = screen.getByTestId('toggle-view');
      fireEvent.click(toggleButton);
      
      expect(mockCallbacks.UpdateUserState).toHaveBeenCalledWith({
        ...mockUserState,
        viewMode: 'grid'
      });
    });

    test('calls UpdateUserState with new filter when filter button is clicked', () => {
      render(<SkipStyleComponent {...defaultProps} />);
      
      const filterButton = screen.getByTestId('filter-category1');
      fireEvent.click(filterButton);
      
      expect(mockCallbacks.UpdateUserState).toHaveBeenCalledWith({
        ...mockUserState,
        activeFilter: 'category1'
      });
    });

    test('handles missing callbacks gracefully', () => {
      const propsWithoutCallbacks = {
        ...defaultProps,
        callbacks: {}
      };
      
      render(<SkipStyleComponent {...propsWithoutCallbacks} />);
      
      const refreshButton = screen.getByTestId('refresh-button');
      const toggleButton = screen.getByTestId('toggle-view');
      
      // Should not throw errors
      fireEvent.click(refreshButton);
      fireEvent.click(toggleButton);
      
      expect(screen.getByTestId('skip-component')).toBeInTheDocument();
    });

    test('displays error when RefreshData fails', async () => {
      mockCallbacks.RefreshData.mockRejectedValue(new Error('Network error'));
      
      render(<SkipStyleComponent {...defaultProps} />);
      
      const refreshButton = screen.getByTestId('refresh-button');
      fireEvent.click(refreshButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
        expect(screen.getByText('Error: Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Style Application', () => {
    test('applies custom styles from props.styles', () => {
      render(<SkipStyleComponent {...defaultProps} />);
      
      const container = screen.getByTestId('skip-component');
      expect(container).toHaveStyle({ backgroundColor: '#f0f0f0' });
      
      const header = container.querySelector('h2').parentElement;
      expect(header).toHaveStyle({ color: '#333' });
    });

    test('applies grid layout based on viewMode', () => {
      const propsWithGridView = {
        ...defaultProps,
        userState: { ...mockUserState, viewMode: 'grid' }
      };
      
      render(<SkipStyleComponent {...propsWithGridView} />);
      
      const dataContainer = screen.getByTestId('data-container');
      expect(dataContainer).toHaveStyle({ display: 'grid' });
    });

    test('applies list layout based on viewMode', () => {
      render(<SkipStyleComponent {...defaultProps} />);
      
      const dataContainer = screen.getByTestId('data-container');
      expect(dataContainer).toHaveStyle({ display: 'flex', flexDirection: 'column' });
    });

    test('highlights active filter button', () => {
      const propsWithActiveFilter = {
        ...defaultProps,
        userState: { ...mockUserState, activeFilter: 'category1' }
      };
      
      render(<SkipStyleComponent {...propsWithActiveFilter} />);
      
      const activeButton = screen.getByTestId('filter-category1');
      const inactiveButton = screen.getByTestId('filter-all');
      
      expect(activeButton).toHaveStyle({ backgroundColor: '#007bff', color: 'white' });
      expect(inactiveButton).toHaveStyle({ backgroundColor: 'white', color: 'black' });
    });
  });

  describe('State Updates', () => {
    test('responds to userState changes', () => {
      const { rerender } = render(<SkipStyleComponent {...defaultProps} />);
      
      // Initially shows list view
      expect(screen.getByText('View: list')).toBeInTheDocument();
      
      // Update to grid view
      const updatedProps = {
        ...defaultProps,
        userState: { ...mockUserState, viewMode: 'grid' }
      };
      rerender(<SkipStyleComponent {...updatedProps} />);
      
      expect(screen.getByText('View: grid')).toBeInTheDocument();
    });

    test('updates filtered items when activeFilter changes', () => {
      const { rerender } = render(<SkipStyleComponent {...defaultProps} />);
      
      // Initially shows all items
      expect(screen.getAllByTestId(/^item-/)).toHaveLength(4);
      
      // Update to show only category1
      const updatedProps = {
        ...defaultProps,
        userState: { ...mockUserState, activeFilter: 'category1' }
      };
      rerender(<SkipStyleComponent {...updatedProps} />);
      
      expect(screen.getAllByTestId(/^item-/)).toHaveLength(2);
    });

    test('maintains filter when data updates', () => {
      const propsWithFilter = {
        ...defaultProps,
        userState: { ...mockUserState, activeFilter: 'category1' }
      };
      
      const { rerender } = render(<SkipStyleComponent {...propsWithFilter} />);
      
      // Initially shows filtered items
      expect(screen.getAllByTestId(/^item-/)).toHaveLength(2);
      
      // Update data with new items
      const updatedData = {
        ...mockData,
        items: [
          ...mockData.items,
          { id: 5, name: 'Item 5', description: 'Fifth item', category: 'category1', value: 300 }
        ]
      };
      
      rerender(<SkipStyleComponent {...propsWithFilter} data={updatedData} />);
      
      // Should show 3 items now (only category1)
      expect(screen.getAllByTestId(/^item-/)).toHaveLength(3);
      expect(screen.getByTestId('item-5')).toBeInTheDocument();
    });
  });

  describe('Utilities Usage', () => {
    test('calls logEvent utility on mount', () => {
      render(<SkipStyleComponent {...defaultProps} />);
      
      expect(mockUtilities.logEvent).toHaveBeenCalledWith('SkipStyleComponent mounted');
    });

    test('handles missing utilities gracefully', () => {
      const propsWithoutUtilities = {
        ...defaultProps,
        utilities: null
      };
      
      // Should not throw error
      render(<SkipStyleComponent {...propsWithoutUtilities} />);
      
      expect(screen.getByTestId('skip-component')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    test('handles null or undefined data gracefully', () => {
      const propsWithNoData = {
        ...defaultProps,
        data: null
      };
      
      render(<SkipStyleComponent {...propsWithNoData} />);
      
      expect(screen.getByText('Skip Component')).toBeInTheDocument(); // Uses default title
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    test('handles items without IDs', () => {
      const dataWithoutIds = {
        ...mockData,
        items: [
          { name: 'No ID Item', description: 'Item without ID', category: 'category1' }
        ]
      };
      
      render(<SkipStyleComponent {...defaultProps} data={dataWithoutIds} />);
      
      expect(screen.getByTestId('item-0')).toBeInTheDocument();
      expect(screen.getByText('No ID Item')).toBeInTheDocument();
    });

    test('preserves refresh button disabled state during loading', async () => {
      mockCallbacks.RefreshData.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      
      render(<SkipStyleComponent {...defaultProps} />);
      
      const refreshButton = screen.getByTestId('refresh-button');
      fireEvent.click(refreshButton);
      
      expect(refreshButton).toBeDisabled();
      
      await waitFor(() => {
        expect(refreshButton).not.toBeDisabled();
      });
    });
  });
});