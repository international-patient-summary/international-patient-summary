// Vitest setup: built-in matchers only (no @testing-library/jest-dom), per tasks.md.
import { cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
