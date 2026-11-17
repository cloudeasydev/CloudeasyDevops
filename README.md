# CloudEasy DevOps

Unified cloud operations portal — projects, secrets, network checks, API Studio, personal drive, blog, team, and more.

## Links

- **GitHub:** [https://github.com/cloudeasydev/CloudeasyDevops](https://github.com/cloudeasydev/CloudeasyDevops)
- **LinkedIn:** [https://www.linkedin.com/in/divyanshutiwari1300](https://www.linkedin.com/in/divyanshutiwari1300)

## Stack

- Next.js 16 + React 19 + TypeScript
- MongoDB Atlas
- S3-compatible storage
- Tailwind CSS
- Email OTP auth (optional fixed OTP for local/admin)

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` (at least `MONGODB_URI`, `SESSION_SECRET`, `ENCRYPTION_KEY`). Then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Admin login (local)

- Email: value of `ADMIN_EMAIL` (default `admin@gmail.com`)
- OTP: value of `OTP_FIXED_CODE` (default `123456`) when set

## Scripts

| Command       | Description              |
|---------------|--------------------------|
| `npm run dev` | Development server       |
| `npm run build` | Production build       |
| `npm start`   | Start production server  |

## License

Private — CloudEasy DevOps.
