import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

let swrReturn: any = {};
vi.mock('swr', () => ({
  default: (key: any, fn: any, opts: any) => swrReturn,
}));

import useCourse from '../../hooks/useCourse';

function TestComp({ id }: any) {
  const { data, loading, error } = useCourse(id);
  if (loading) return <div>loading</div>;
  if (error) return <div>error</div>;
  return <div>{data?.title}</div>;
}

describe('useCourse (SWR mocked)', () => {
  it('shows loading', () => {
    swrReturn = { data: undefined, error: null, isLoading: true };
    render(<TestComp id={1} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows error', () => {
    swrReturn = { data: undefined, error: new Error('boom'), isLoading: false };
    render(<TestComp id={1} />);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });

  it('renders course', () => {
    swrReturn = { data: { id: 1, title: 'Course X' }, error: null, isLoading: false };
    render(<TestComp id={1} />);
    expect(screen.getByText('Course X')).toBeInTheDocument();
  });
});
