import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock CSS imports to avoid Tailwind CSS v4 ES module conflicts
vi.mock('*.css', () => ({}));
vi.mock('@/app/globals.css', () => ({}));

// Cleanup after each test
afterEach(() => {
  cleanup();
});
