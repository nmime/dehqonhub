import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Testing Library installs its auto-cleanup hook only when Vitest `globals` are enabled, and
 * every config in this workspace sets `globals: false`. Without this setup file, rendered trees
 * accumulate in the document across tests in the same file, so `getByRole`/`getByText` can match
 * a node left over from an earlier test and the suite becomes order-dependent.
 *
 * Registering cleanup here rather than per spec means new specs inherit it. Specs that already
 * call `cleanup()` themselves are unaffected — a second call is a no-op.
 */
afterEach(() => {
  cleanup();
});

/**
 * `findBy*`/`waitFor` give up after one second by default, which is generous for
 * a rendered component and tight for one that has to fetch its route chunk
 * first. A lazily loaded page resolves in milliseconds when the machine is idle
 * and can take considerably longer when every spec file in the project is
 * running at once, so the ceiling is raised to five seconds — still well inside
 * each project's test timeout, and only reached by a query that would otherwise
 * have failed.
 */
configure({ asyncUtilTimeout: 5000 });
