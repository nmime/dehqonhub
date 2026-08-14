import { ProblemTypeDefinitions, ProblemTypeDocumentationUrl, problemTypeForCode } from '@app/common-problem-details';
import { useI18n } from '@app/frontend-runtime';
import { UiSection } from '../../../shared/ui';

export const ProblemsPage = () => {
  const { t } = useI18n();

  return (
    <UiSection
      className="user-problem-registry"
      eyebrow={t('site.problems.kicker')}
      headingLevel={1}
      title={t('site.problems.title')}
      titleId="problem-registry-title"
    >
      <p className="user-problem-registry__intro">
        {t('site.problems.intro')} <code>{ProblemTypeDocumentationUrl}</code>. {t('site.problems.instanceDetail')}
      </p>

      <article aria-labelledby="problem-about-blank-title" className="user-problem-card" id="about-blank">
        <h2 id="problem-about-blank-title">
          <code>about:blank</code>
        </h2>
        <p>{t('site.problems.aboutBlank')}</p>
      </article>

      {ProblemTypeDefinitions.map((problem) => (
        <article
          aria-labelledby={`problem-${problem.code}-title`}
          className="user-problem-card"
          id={problem.code}
          key={problem.code}
        >
          <h2 id={`problem-${problem.code}-title`}>{problem.title}</h2>
          <code className="user-problem-card__type">{problemTypeForCode(problem.code)}</code>
          <dl>
            <dt>{t('site.problems.status')}</dt>
            <dd>{problem.status}</dd>
            <dt>{t('site.problems.meaning')}</dt>
            <dd>{problem.detail}</dd>
            <dt>{t('site.problems.resolution')}</dt>
            <dd>{problem.resolution}</dd>
            <dt>{t('site.problems.extensions')}</dt>
            <dd>
              <ul>
                {problem.extensions.map((extension) => (
                  <li key={extension.name}>
                    <code>{extension.name}</code>
                    <span>{extension.description}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </dl>
        </article>
      ))}
    </UiSection>
  );
};
