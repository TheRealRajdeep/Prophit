# Prophit

**Predict. Bet. Win.** — On-chain prediction markets for Twitch streamers.

A full-stack platform where viewers can place real-time predictions on live streams using USDC. Built for [Hackmoney 2026](https://ethglobal.com/events/hackmoney2026).

---

## What is Prophit?

Prophit brings betting to Twitch. Streamers create prediction markets (e.g. *"Will I win this round?"*), and viewers lock in their bets with USDC on Base Sepolia. Predictions are resolved on-chain with a pari-mutuel payout formula — winners share the pool.

| Feature | Description |
|---------|-------------|
| **Live Streams** | Browse and watch Twitch streams with an embedded player |
| **On-Chain Predictions** | Create and bet on predictions using USDC (ERC20) |
| **Real-Time Chat** | Custom chat with wallet-linked usernames |
| **ENS Usernames** | Register `*.prophit.eth` subdomains for your identity |
| **Embedded Wallets** | Privy-powered auth and embedded wallets for seamless UX |

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS, Privy, Viem |
| **Backend** | Express, Socket.IO, Drizzle ORM, PostgreSQL |
| **Smart Contracts** | Solidity, Hardhat, Base Sepolia |
| **Integrations** | Twitch API, ENS (Sepolia), USDC |

---

## Project Structure

```
/
├── frontend/          # Next.js app (streams, predictions, chat)
├── backend/           # Express API + Socket.IO chat server
├── contracts/          # Solidity prediction contracts (Hardhat)
└── README.md
```

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **PostgreSQL** (for user data, chat, streamer registry)
- **API keys**: [Privy](https://dashboard.privy.io), [Twitch](https://dev.twitch.tv/console)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/hackmoney-2026.git
cd hackmoney-2026

# Install dependencies
cd frontend && npm install
cd ../backend && npm install
cd ../contracts && npm install
```

### 2. Environment Variables

**Frontend** — copy `frontend/.env.example` → `frontend/.env`:

```env
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
NEXT_PUBLIC_PRIVY_CLIENT_ID=your-privy-client-id
TWITCH_CLIENT_ID=your-twitch-client-id
TWITCH_CLIENT_SECRET=your-twitch-client-secret
```

**Backend** — create `backend/.env`:

```env
PORT=3001
DATABASE_URL=postgresql://user:pass@localhost:5432/prophit
```

### 3. Database Setup

```bash
cd backend
npm run db:push
```

### 4. Run

```bash
# Terminal 1: Backend (API + Socket.IO)
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Contracts

Predictions run on **Base Sepolia** via `PredictionFactoryUSDC`. See `contracts/README.md` and `contracts/DEPLOY_USDC.md` for deployment details.

```bash
cd contracts
npx hardhat test
npx hardhat ignition deploy ./ignition/modules/PredictionFactoryUSDC.ts --network baseSepolia
```

---

## Configuration Reference

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app ID for auth |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID` | Privy client ID |
| `TWITCH_CLIENT_ID` | Twitch API client ID |
| `TWITCH_CLIENT_SECRET` | Twitch API secret |
| `DATABASE_URL` | PostgreSQL connection string |

---

## License

MIT
