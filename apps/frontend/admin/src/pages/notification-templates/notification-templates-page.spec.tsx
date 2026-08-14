// @requirements REQ-FRONTEND-SHELL-004
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminApi } from '@app/frontend-api-client';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { createAdminAccess } from '../../entities/admin-session';
import { NotificationTemplatesPage } from './notification-templates-page';

const ok = <T,>(data: T) => ({
  data,
  error: undefined,
  response: new Response(null, { status: 200 }),
});

const template = (
  overrides: Partial<adminApi.AdminNotificationTemplateViewDto> = {},
): adminApi.AdminNotificationTemplateViewDto => ({
  code: 'weekly-update',
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Weekly update',
  source: 'admin',
  status: 'published',
  updatedAt: '2026-08-14T00:00:00.000Z',
  versions: [
    { channels: {}, id: 'version-id', updatedAt: '2026-08-14T00:00:00.000Z', variablesSchema: {}, version: 3 },
  ],
  ...overrides,
});

const renderPage = (permissions: string[]) =>
  render(
    <FrontendStateProvider>
      <FrontendI18nProvider translations={adminFrontendTranslations}>
        <QueryClientProvider client={new QueryClient()}>
          <NotificationTemplatesPage
            access={createAdminAccess({ permissions, roles: ['operations'], subject: 'admin-id' })}
          />
        </QueryClientProvider>
      </FrontendI18nProvider>
    </FrontendStateProvider>,
  );

const readOnly = ['admin:notification-templates:read'];
const author = ['admin:notification-templates:read', 'admin:notification-templates:write'];
const tester = ['admin:notification-templates:read', 'admin:notification-templates:test'];
// The channel selector lives in the create form, so a test send aimed at a bot or push
// provider needs the authoring capability next to the test capability.
const operator = [...author, 'admin:notification-templates:test'];

const fillRequiredFields = () => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Template code' }), { target: { value: 'weekly-update' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Weekly update' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'English body' }), { target: { value: 'Hello {name}' } });
};

const chooseOption = async (selectLabel: string, optionLabel: string) => {
  fireEvent.click(screen.getByRole('combobox', { name: selectLabel }));
  fireEvent.click(await screen.findByRole('option', { name: optionLabel }));
};

describe('NotificationTemplatesPage', () => {
  // Every select on this page opens with a value already chosen, and the select
  // primitive scrolls the checked item into view when it opens. jsdom implements no
  // scroll geometry at all, so the method has to exist before the first open.
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterAll(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists every template and keeps operator actions behind their capabilities', async () => {
    vi.spyOn(adminApi, 'adminNotificationsControllerListTemplates').mockResolvedValue(
      ok({
        items: [
          template(),
          template({
            code: 'seeded-welcome',
            id: '00000000-0000-4000-8000-000000000002',
            name: 'Seeded welcome',
            source: 'seed',
            status: 'draft',
            versions: [],
          }),
        ],
      }),
    );

    renderPage(readOnly);

    expect(await screen.findByText('Weekly update')).toBeTruthy();
    expect(screen.getByText('weekly-update')).toBeTruthy();
    expect(screen.getByText('published')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Seeded welcome')).toBeTruthy();
    expect(screen.getByText('draft')).toBeTruthy();
    // A template that has never been versioned reports a dash instead of a number.
    expect(screen.getByText('—')).toBeTruthy();

    // Previewing is a read of the rendered message, so every reader gets it. Sending a
    // test message, publishing and archiving each need their own permission, and
    // publishing is additionally limited to operator-authored templates.
    expect(screen.getAllByRole('button', { name: 'Preview' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Send test' })).toBeFalsy();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeFalsy();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeFalsy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeFalsy();
  });

  it('creates an email template with localized subject, body and HTML', async () => {
    vi.spyOn(adminApi, 'adminNotificationsControllerListTemplates').mockResolvedValue(ok({ items: [] }));
    const create = vi.spyOn(adminApi, 'adminNotificationsControllerCreateTemplate').mockResolvedValue(ok(template()));

    renderPage(author);
    // The empty state names itself in both its title and its description.
    expect(await screen.findAllByText('No records yet')).not.toHaveLength(0);

    fillRequiredFields();
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'Weekly digest' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'English subject' }), { target: { value: 'This week' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Russian subject' }), { target: { value: 'Эта неделя' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Russian body' }), { target: { value: 'Привет {name}' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'English HTML (email, optional)' }), {
      target: { value: '<p>Hello</p>' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Russian HTML (email, optional)' }), {
      target: { value: '<p>Привет</p>' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Variables schema (JSON)' }), {
      target: { value: '{"name":{"type":"string"}}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        {
          channels: [
            {
              channel: 'email',
              content: {
                body: { en: 'Hello {name}', ru: 'Привет {name}' },
                html: { en: '<p>Hello</p>', ru: '<p>Привет</p>' },
                subject: { en: 'This week', ru: 'Эта неделя' },
              },
              engine: 'string-format',
            },
          ],
          code: 'weekly-update',
          description: 'Weekly digest',
          name: 'Weekly update',
          variablesSchema: { name: { type: 'string' } },
        },
        undefined,
      );
    });
    expect(await screen.findByText('Notification operation completed.')).toBeTruthy();
  });

  it('offers an image instead of HTML once a bot channel is selected', async () => {
    vi.spyOn(adminApi, 'adminNotificationsControllerListTemplates').mockResolvedValue(ok({ items: [] }));
    const create = vi.spyOn(adminApi, 'adminNotificationsControllerCreateTemplate').mockResolvedValue(ok(template()));

    renderPage(author);
    // The empty state names itself in both its title and its description.
    expect(await screen.findAllByText('No records yet')).not.toHaveLength(0);

    await chooseOption('Channel', 'Bot');

    // A bot message carries no subject and no HTML part, and gains an image URL.
    expect(screen.queryByRole('textbox', { name: 'English subject' })).toBeFalsy();
    expect(screen.queryByRole('textbox', { name: 'English HTML (email, optional)' })).toBeFalsy();

    fillRequiredFields();
    fireEvent.change(screen.getByRole('textbox', { name: 'Image URL (optional)' }), {
      target: { value: 'https://cdn.dehqonhub.uz/banner.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        {
          channels: [
            {
              channel: 'bot',
              content: {
                body: { en: 'Hello {name}', ru: '' },
                image: { en: 'https://cdn.dehqonhub.uz/banner.png', ru: 'https://cdn.dehqonhub.uz/banner.png' },
              },
              engine: 'string-format',
            },
          ],
          code: 'weekly-update',
          description: undefined,
          name: 'Weekly update',
          variablesSchema: {},
        },
        undefined,
      );
    });
  });

  it('keeps a push subject when one is entered before the channel changes', async () => {
    vi.spyOn(adminApi, 'adminNotificationsControllerListTemplates').mockResolvedValue(ok({ items: [] }));
    const create = vi.spyOn(adminApi, 'adminNotificationsControllerCreateTemplate').mockResolvedValue(ok(template()));

    renderPage(author);
    // The empty state names itself in both its title and its description.
    expect(await screen.findAllByText('No records yet')).not.toHaveLength(0);

    await chooseOption('Channel', 'Push notification');
    fillRequiredFields();
    fireEvent.change(screen.getByRole('textbox', { name: 'English subject' }), { target: { value: 'Harvest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          channels: [
            {
              channel: 'push',
              content: { body: { en: 'Hello {name}', ru: '' }, subject: { en: 'Harvest', ru: '' } },
              engine: 'string-format',
            },
          ],
        }),
        undefined,
      );
    });
  });

  it('refuses to create a template when the variables schema is not a JSON object', async () => {
    vi.spyOn(adminApi, 'adminNotificationsControllerListTemplates').mockResolvedValue(ok({ items: [] }));
    const create = vi.spyOn(adminApi, 'adminNotificationsControllerCreateTemplate').mockResolvedValue(ok(template()));

    renderPage(author);
    // The empty state names itself in both its title and its description.
    expect(await screen.findAllByText('No records yet')).not.toHaveLength(0);

    fillRequiredFields();
    fireEvent.change(screen.getByRole('textbox', { name: 'Variables schema (JSON)' }), { target: { value: '[]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter valid JSON before continuing.')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('renders a preview for the entered variables', async () => {
    vi.spyOn(adminApi, 'adminNotificationsControllerListTemplates').mockResolvedValue(ok({ items: [template()] }));
    const preview = vi
      .spyOn(adminApi, 'adminNotificationsControllerPreviewTemplate')
      .mockResolvedValue(ok({ message: { body: 'Hello Ada', subject: 'This week' } }));

    renderPage(readOnly);
    expect(await screen.findByText('Weekly update')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Preview variables (JSON)' }), {
      target: { value: '{"name":"Ada"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(preview).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        { channel: 'email', language: 'en', variables: { name: 'Ada' } },
        undefined,
      );
    });
    expect(await screen.findByText('{"body":"Hello Ada","subject":"This week"}')).toBeTruthy();
  });

  it('reports unparsable preview variables instead of calling the API', async () => {
    vi.spyOn(adminApi, 'adminNotificationsControllerListTemplates').mockResolvedValue(ok({ items: [template()] }));
    const preview = vi.spyOn(adminApi, 'adminNotificationsControllerPreviewTemplate');

    renderPage(readOnly);
    expect(await screen.findByText('Weekly update')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Preview variables (JSON)' }), {
      target: { value: 'not-json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('Notification operation failed.')).toBeTruthy();
    expect(preview).not.toHaveBeenCalled();
  });

  it.each([
    ['Email', 'Resend', 'email', 'resend', 'email'],
    ['Email', 'MailPace', 'email', 'mailpace', 'email'],
    ['Bot', 'Telegram Bot', 'bot', 'telegram-bot', 'telegram-chat'],
    ['Bot', 'Discord Bot', 'bot', 'discord-bot', 'user'],
    ['Push notification', 'Google FCM', 'push', 'google-fcm', 'push-token'],
    ['Push notification', 'Apple APNs', 'push', 'apple-apns', 'push-token'],
  ] as const)(
    'sends a %s test through %s as a %s message',
    async (channelLabel, providerLabel, channel, provider, targetType) => {
      vi.spyOn(adminApi, 'adminNotificationsControllerListTemplates').mockResolvedValue(ok({ items: [template()] }));
      const testSend = vi
        .spyOn(adminApi, 'adminNotificationsControllerTestSend')
        .mockResolvedValue(ok({ message: {} }));

      renderPage(operator);
      expect(await screen.findByText('Weekly update')).toBeTruthy();

      await chooseOption('Channel', channelLabel);
      await chooseOption('Test provider', providerLabel);
      fireEvent.change(screen.getByRole('textbox', { name: 'Test recipient' }), {
        target: { value: 'recipient-id' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Send test' }));

      await waitFor(() => {
        expect(testSend).toHaveBeenCalledWith(
          '00000000-0000-4000-8000-000000000001',
          { channel, language: 'en', provider, targetId: 'recipient-id', targetType, variables: {} },
          undefined,
        );
      });
    },
  );

  it('keeps the test button disabled until a recipient is entered', async () => {
    vi.spyOn(adminApi, 'adminNotificationsControllerListTemplates').mockResolvedValue(ok({ items: [template()] }));

    renderPage(tester);
    expect(await screen.findByText('Weekly update')).toBeTruthy();

    expect(screen.getByRole('button', { name: 'Send test' }).hasAttribute('disabled')).toBe(true);
  });

  it('publishes an operator template and reports a failed archive', async () => {
    const list = vi
      .spyOn(adminApi, 'adminNotificationsControllerListTemplates')
      .mockResolvedValue(ok({ items: [template()] }));
    const publish = vi.spyOn(adminApi, 'adminNotificationsControllerPublishTemplate').mockResolvedValue(ok(template()));
    const archive = vi
      .spyOn(adminApi, 'adminNotificationsControllerArchiveTemplate')
      .mockRejectedValue(new Error('conflict'));

    renderPage(author);
    expect(await screen.findByText('Weekly update')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', undefined);
    });
    expect(await screen.findByText('Notification operation completed.')).toBeTruthy();
    // The success handler invalidates the list, so the table refetches.
    await waitFor(() => {
      expect(list.mock.calls.length).toBeGreaterThan(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(archive).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', undefined);
    });
    expect(await screen.findByText('Notification operation failed.')).toBeTruthy();
  });

  it('surfaces a failed template list inside the table', async () => {
    vi.spyOn(adminApi, 'adminNotificationsControllerListTemplates').mockRejectedValue(new Error('unavailable'));

    renderPage(readOnly);

    expect(await screen.findByText('Notification operation failed.')).toBeTruthy();
  });
});
