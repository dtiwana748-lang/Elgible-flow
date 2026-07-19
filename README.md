# Eligibility Flow

MERN application for securely managing education eligibility lists at department scale.

## Roles

- `HOD`: approves/rejects eligibility decisions, manages users, views audit logs.
- `LIST_MAKER`: imports data, maintains student records, prepares eligibility lists.

## Quick Start

```bash
npm run install:all
cp backend/.env.example backend/.env
npm run dev
```

Set `MONGODB_URI`, `JWT_SECRET`, and `CLIENT_ORIGIN` in `backend/.env`.

## First Admin

Create the first HOD with:

```bash
cd backend
npm run seed:hod
```

The script uses `SEED_HOD_NAME`, `SEED_HOD_EMAIL`, and `SEED_HOD_PASSWORD` from `.env`.
