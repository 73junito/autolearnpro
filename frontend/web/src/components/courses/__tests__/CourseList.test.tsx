import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock the hook used by CourseList
vi.mock('../../../lib/hooks/useCourses', () => ({
  default: (params: any) => ({ data: [
    { id: 1, code: 'A1', title: 'Intro 1', description: 'Desc 1' },
    { id: 2, code: 'B2', title: 'Intro 2', description: 'Desc 2' },
  ], loading: false, error: null })
}));

import CourseList from '../CourseList';

describe('CourseList', () => {
  it('renders a list of courses from the hook', () => {
    render(<CourseList />);
    expect(screen.getByText('Intro 1')).toBeInTheDocument();
    expect(screen.getByText('Intro 2')).toBeInTheDocument();
  });
});
