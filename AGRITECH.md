# AgroUz — AgriTech B2B Platform for Uzbekistan

DeHaat-style B2B platform targeting 414K dehqan farms in Uzbekistan. Digitizes input procurement (fertilizers, seeds, pesticides) and output aggregation for smallholder farmers.

## Market Context
- **$34.2B** agricultural output (24.3% of GDP)
- **414K** dehqan farms producing 65% of ag output
- **60+** AgriTech players (fragmented, no end-to-end platform)
- **52 subsidy types**, $700M+ donor funding available
- PTA Incubation deadline: **August 10, 2026**

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
│  /register    Farmer Registration (React + Vite)     │
│  /dashboard   Farmer Dashboard with stats            │
│  /catalog     Input Catalog (fertilizer/seed/etc)    │
│  Telegram Bot Farmer engagement via @AgroUzBot       │
└─────────────────────────────────────────────────────┘
                        ↕ REST API
┌─────────────────────────────────────────────────────┐
│                  Backend (NestJS)                    │
│                                                      │
│  Feature: farmer    Registration, profile, list      │
│  Feature: product   Input catalog, supplier mgmt     │
│  Feature: order     Order placement, tracking        │
│  Feature: payment   Click/Payme integration          │
│  Feature: telegram  Bot commands & notifications     │
│                                                      │
│  DDD Pattern: domain → application → interfaces      │
│  Database: PostgreSQL + MikroORM                     │
└─────────────────────────────────────────────────────┘
```

## Tech Stack
- **Backend**: NestJS + Fastify, MikroORM, PostgreSQL
- **Frontend**: React + Vite (FSD architecture), TanStack Router
- **Telegram**: grammy framework
- **Payments**: Click API, Payme API
- **i18n**: EN, RU, UZ support
- **Deployment**: Docker, NX monorepo

## Quick Start

```bash
# Install dependencies
npm install -g pnpm@11.15.1
pnpm install --frozen-lockfile

# Initialize product identity
pnpm nrb init --name "AgroUz" --domain agrouz.uz --apex-app landing-app --owner agrouz-team

# Setup with Telegram bot
pnpm nrb setup --app telegram-bot-api --non-interactive
pnpm nrb closure install

# Configure environment
cp .env.example .env
# Set DATABASE_URL, TELEGRAM_BOT_TOKEN, CLICK_MERCHANT_ID, PAYME_ORG_ID

# Start database (Docker required)
docker compose --profile postgres up -d postgres
pnpm run db:migrate

# Run development server
pnpm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/farmers` | Register farmer |
| GET | `/api/v1/farmers/:id` | Get farmer profile |
| GET | `/api/v1/farmers?region=&role=` | List farmers |
| PUT | `/api/v1/farmers/:id` | Update farmer |
| POST | `/api/v1/products` | Create product listing |
| GET | `/api/v1/products?category=&region=` | Browse catalog |
| POST | `/api/v1/orders` | Place input order |
| GET | `/api/v1/orders?farmerId=` | List farmer orders |
| PATCH | `/api/v1/orders/:id/status` | Update order status |
| POST | `/api/v1/payments` | Create payment intent |
| POST | `/api/v1/payments/callback/click` | Click callback |
| POST | `/api/v1/payments/callback/payme` | Payme callback |

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/agristart` | Start AgriTech assistant |
| `/menu` | Show main menu |
| `/orders` | View recent orders |
| `/catalog` | Browse input catalog |
| `/weather` | Get weather forecast |
| `/advice` | Get crop recommendations |

## Project Structure

```
libs/backend/feature/
├── farmer/main/lib/       # Farmer feature (controllers, modules)
├── farmer/shared/lib/     # Domain entities, use-cases, repository interfaces
├── product/main/lib/      # Product catalog feature
├── product/shared/lib/    # Domain entities, use-cases
├── order/main/lib/        # Order management feature
├── order/shared/lib/      # Domain entities, use-cases
├── payment/lib/           # Click/Payme payment integration
└── telegram-agritech/lib/ # Telegram bot handler for AgriTech

libs/backend/postgres/main/agritech/lib/
├── entities/              # MikroORM entity schemas
└── repositories/          # PostgreSQL repository implementations

apps/frontend/app/src/pages/
├── farmer-register/       # Registration page
├── farmer-dashboard/      # Dashboard with stats
└── product-catalog/       # Input catalog browsing

i18n/{en,ru}/agritech/     # Translations (EN + RU)
```

## Research Reports
- [English Report](https://41999-f0svjqrodn66pn99.splox.app/report_en.html) (60KB)
- [Russian Report](https://41999-4uellwd7q9mptbox.splox.app/report_ru.html) (60KB)

## PTA Pitch Strategy
1. **Working MVP** with 100+ pilot farmers (Fergana Valley)
2. **Real metrics**: order volume, farmer retention, supplier count
3. **Clear story**: "DeHaat for Uzbekistan" — digitizing $4.8-6.2B TAM
4. **Team**: 2-5 members (recruit agribusiness co-founder)
5. **Government alignment**: Agroportal integration, 52 subsidy types leveraged

## License
MIT
