import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Provide a mutable holder the mock will read so tests can change the returned state.
let swrReturn: any = {};
vi.mock('swr', () => ({
  default: (key: any, fn: any, opts: any) => swrReturn,
}));

import useCourses from '../../../lib/hooks/useCourses';

function TestComp(props: any) {
  const { data, loading, error } = useCourses(props.params);
  if (loading) return <div>loading</div>;
  if (error) return <div>error</div>;
  return (
    <div>
      {(data || []).map((c: any) => (
        <div key={c.id}>{c.title}</div>
      ))}
    </div>
  );
}

describe('useCourses (SWR mocked)', () => {
  it('shows loading state', () => {
    swrReturn = { data: undefined, error: null, isLoading: true };
    render(<TestComp />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    swrReturn = { data: undefined, error: new Error('fail'), isLoading: false };
    render(<TestComp />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });

  it('renders data when present', () => {
    swrReturn = { data: [{ id: 1, title: 'C1' }], error: null, isLoading: false };
    render(<TestComp />);
    expect(screen.getByText('C1')).toBeInTheDocument();
  });
});
