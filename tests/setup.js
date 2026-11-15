import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest doesn't expose globals by default, so unmount between tests explicitly.
afterEach(() => cleanup());
