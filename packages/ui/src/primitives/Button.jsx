import React from 'react';

export default function Button({ children, onClick, className = '' }) {
  return (
    <button className={`btn ${className}`.trim()} onClick={onClick}>
      {children}
    </button>
  );
}
