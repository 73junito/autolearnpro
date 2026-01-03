import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CourseCard from '../CourseCard';

const sample = {
  id: 1,
  code: 'A5',
  title: 'Brake Systems (ASE A5)',
  description: 'Intro to brake systems',
  delivery_mode: 'Virtual',
};

describe('CourseCard', () => {
  it('renders title, code and view link', () => {
    render(<CourseCard course={sample as any} />);
    expect(screen.getByText(sample.title)).toBeInTheDocument();
    expect(screen.getByText(sample.code)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view/i })).toBeInTheDocument();
  });
});
