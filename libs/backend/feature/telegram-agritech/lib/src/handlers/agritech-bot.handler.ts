import { Composer, InlineKeyboard } from 'grammy';
import type { TelegramBotContext } from '@app/backend-feature-telegram-bot';

/**
 * AgriTech Telegram Bot Handler
 * Extends the base Telegram bot with farmer-specific commands and notifications.
 * 
 * Commands:
 * /agristart - Start AgriTech assistant
 * /orders - View recent orders
 * /catalog - Browse input catalog
 * /weather - Get weather forecast
 * /advice - Get crop recommendations
 */

export function createAgriTechBot(): Composer<TelegramBotContext> {
  const composer = new Composer<TelegramBotContext>();

  composer.command('agristart', async (ctx) => {
    const name = ctx.from?.first_name || 'Farmer';
    await ctx.reply(
      `🌾 <b>AgroUz Assistant</b>\n\n` +
      `Assalomu alaykum, ${name}!\n\n` +
      `I help you with:\n` +
      `📦 Order fertilizers, seeds, pesticides\n` +
      `🌱 Get crop recommendations\n` +
      `🌤️ Check weather forecasts\n` +
      `📊 Track your orders\n\n` +
      `Use /menu to see all commands.`,
      { parse_mode: 'HTML' }
    );
  });

  composer.command('menu', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text('📦 My Orders', 'agrouz:orders')
      .row()
      .text('🛒 Catalog', 'agrouz:catalog')
      .row()
      .text('🌤️ Weather', 'agrouz:weather')
      .row()
      .text('🌱 Advice', 'agrouz:advice')
      .row()
      .url('🌐 Open Web App', `${process.env.TELEGRAM_BOT_APP_URL || 'https://agrouz.uz'}`);

    await ctx.reply(
      '<b>AgroUz Menu</b>\n\nWhat would you like to do?',
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
  });

  composer.command('orders', async (ctx) => {
    // TODO: Fetch from API when backend is running
    const orders = [
      { id: '#1001', date: 'Aug 1', amount: '850,000 UZS', status: '🔄 Processing' },
      { id: '#1002', date: 'Jul 28', amount: '420,000 UZS', status: '✅ Delivered' },
    ];

    let text = '<b>Your Recent Orders</b>\n\n';
    for (const order of orders) {
      text += `<b>${order.id}</b> (${order.date})\n`;
      text += `Amount: ${order.amount}\n`;
      text += `Status: ${order.status}\n\n`;
    }

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  composer.command('catalog', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text('💊 Fertilizers', 'agrouz:cat:fertilizer')
      .text('🌾 Seeds', 'agrouz:cat:seed')
      .row()
      .text('🧴 Pesticides', 'agrouz:cat:pesticide')
      .text('⚙️ Equipment', 'agrouz:cat:equipment')
      .row()
      .url('🌐 Full Catalog', `${process.env.TELEGRAM_BOT_APP_URL || 'https://agrouz.uz/catalog'}`);

    await ctx.reply(
      '<b>Input Catalog</b>\n\nSelect a category:',
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
  });

  composer.command('weather', async (ctx) => {
    // TODO: Integrate with weather API
    await ctx.reply(
      '🌤️ <b>Weather Forecast — Tashkent</b>\n\n' +
      'Today: 32°C ☀️ Clear\n' +
      'Tomorrow: 30°C ⛅ Partly Cloudy\n' +
      'Wednesday: 28°C 🌧 Rain expected\n\n' +
      '<i>Irrigation recommended for tomorrow.</i>',
      { parse_mode: 'HTML' }
    );
  });

  composer.command('advice', async (ctx) => {
    await ctx.reply(
      '🌱 <b>Crop Advisory</b>\n\n' +
      'Based on your cotton field in Fergana Valley:\n\n' +
      '• <b>Nitrogen:</b> Apply 120kg/ha urea within 7 days\n' +
      '• <b>Irrigation:</b> Next watering in 3 days (soil moisture low)\n' +
      '• <b>Pest Alert:</b> Aphid risk HIGH this week — consider Karate Zeon\n' +
      '• <b>Harvest:</b> Estimated 45 days based on current growth stage\n\n' +
      '<i>Tip: Early morning application of fertilizer gives best results.</i>',
      { parse_mode: 'HTML' }
    );
  });

  // Handle callback queries for inline buttons
  composer.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data === 'agrouz:orders') {
      await ctx.answerCallbackQuery();
      await ctx.editText(
        '<b>Your Recent Orders</b>\n\n' +
        '#1001 (Aug 1)\nAmount: 850,000 UZS\nStatus: 🔄 Processing\n\n' +
        '#1002 (Jul 28)\nAmount: 420,000 UZS\nStatus: ✅ Delivered',
        { parse_mode: 'HTML' }
      );
    } else if (data === 'agrouz:catalog') {
      await ctx.answerCallbackQuery();
      await ctx.reply('Opening catalog...', {});
      // TODO: Deep link to web app catalog page
    } else if (data.startsWith('agrouz:cat:')) {
      const category = data.split(':')[2];
      await ctx.answerCallbackQuery({ text: `${category} selected` });
      // TODO: Show products in this category
    } else if (data === 'agrouz:weather') {
      await ctx.answerCallbackQuery();
      await ctx.reply('Fetching weather data...', {});
    } else if (data === 'agrouz:advice') {
      await ctx.answerCallbackQuery();
      await ctx.reply('Analyzing your field data...', {});
    }
  });

  return composer;
}
