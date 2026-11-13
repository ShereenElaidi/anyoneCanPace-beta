import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  // Server tests run in the Node environment, which has no page storage.
  if (typeof window !== 'undefined') localStorage.clear();
});
