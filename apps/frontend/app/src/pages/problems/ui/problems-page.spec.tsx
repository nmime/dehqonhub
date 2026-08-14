// @requirements REQ-AGRITECH-ROUTING-015, REQ-API-PROBLEM-001
import { render, screen, within } from '@testing-library/react';
import { ProblemTypeDefinitions, ProblemTypeDocumentationUrl, problemTypeForCode } from '@app/common-problem-details';
import { describe, expect, it, vi } from 'vitest';
import { ProblemsPage } from './problems-page';

vi.mock('@app/frontend-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-runtime')>();

  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key }),
  };
});

describe('user problem registry page', () => {
  it('renders the canonical RFC 9457 registry from the common definitions', () => {
    render(<ProblemsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'site.problems.title' })).toBeTruthy();
    expect(screen.getByText(ProblemTypeDocumentationUrl)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'about:blank' })).toBeTruthy();

    for (const problem of ProblemTypeDefinitions) {
      const article = document.getElementById(problem.code);
      expect(article).not.toBeNull();
      expect(within(article as HTMLElement).getByRole('heading', { level: 2, name: problem.title })).toBeTruthy();
      expect(within(article as HTMLElement).getByText(problemTypeForCode(problem.code))).toBeTruthy();
      for (const extension of problem.extensions) {
        expect(within(article as HTMLElement).getByText(extension.name)).toBeTruthy();
        expect(within(article as HTMLElement).getByText(extension.description)).toBeTruthy();
      }
    }
  });
});
