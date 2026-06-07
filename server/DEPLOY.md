# Deploying the Pathment backend (Docker + Caddy) on your Linux box

This deploys the API (Express + Socket.IO + the in-process email-queue worker) as a
single container, fronted by **Caddy** for automatic HTTPS. Postgres stays on
**DigitalOcean managed Postgres** — we do not run a database on the box.

```
Vercel (frontend) ──HTTPS──▶ api.yourdomain.com ─▶ Caddy ─▶ api:5000 ─▶ DO Postgres
```

> 🔒 **Deploying on a shared VPS** (other users have accounts on the box)? Read
> **[SECURITY.md](./SECURITY.md)** first — it covers rootless Docker, file-permission
> isolation, and cross-account managed-DB access. The short version: you can isolate from
> other *non-root* users, but you cannot hide secrets from anyone with root/sudo.
>
> ⚠️ **Latency note.** Your DB is in a different region/country from this box. Every
> request makes several SQL round-trips, so each one pays that network hop. Watch
> response times after launch; if it feels slow, the fix is to move the DB to the
> box's region (or add a read replica there) — not more RAM.

---

## 0. Preflight — confirm the box can host a public API

You said you're unsure about the IP. Check it:

```bash
# Public IP the world sees:
curl -4 -s ifconfig.me ; echo
# The box's own interface IPs:
ip -4 addr | grep inet
```

- If the **public IP matches** one of the interface IPs (or your provider says it's a
  dedicated/static IP) and you can open ports 80/443 → you're good.
- If the public IP is **different** from the interface IP, the box is behind NAT — you'd
  need port-forwarding on the router for 80/443, and a way to keep the IP stable. If you
  can't, host on a small DigitalOcean Droplet instead (the files here work unchanged).

You also need the public IP to be **stable** (it must not change), because DNS points at it.

---

## 1. DNS — point a subdomain at the box

In DigitalOcean → Networking → Domains (your domain), add an **A record**:

```
Type: A   Host: api   Value: <box public IP>   TTL: 3600
```

This gives you `api.yourdomain.com`. Wait for it to resolve:

```bash
dig +short api.yourdomain.com    # should print the box IP
```

Caddy needs ports **80 and 443** reachable from the internet to issue the TLS cert.

---

## 2. Let the DB accept connections from the box

DigitalOcean → Databases → your DB → **Settings → Trusted Sources** → add the box's
**public IP**. Keep `?sslmode=require` in `DATABASE_URL` (DO requires SSL).

Test from the box later (after install) with: `docker compose run --rm api npm run test:db`.

---

## 3. Install Docker on the box (Ubuntu/Debian)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER       # then log out/in so `docker` works without sudo
docker --version && docker compose version
```

---

## 4. Get the code + configure the environment

```bash
git clone <your-repo-url> pathment && cd pathment/server
cp .env.example .env
nano .env      # fill EVERYTHING in (see the checklist below)
```

**Must-set for production** (the app won't work correctly without these):

| Var | Notes |
| --- | --- |
| `API_DOMAIN` | `api.yourdomain.com` (Caddy issues the cert for this) |
| `CLIENT_URL` | your Vercel frontend URL(s), comma-separated — this is the CORS allow-list |
| `DATABASE_URL` | DO connection string, **ending in `?sslmode=require`** |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | `openssl rand -hex 48` each — different values |
| `AI_ENCRYPTION_KEY` | `openssl rand -hex 32` (encrypts users' BYO AI keys) |
| `CLOUDINARY_*` | image uploads |
| `RESEND_API_KEY`, `RESEND_FROM` | email; `RESEND_WEBHOOK_SECRET` if you use the bounce webhook |
| `AI_API_KEY` (+ provider/model) | roadmap/report generation |

---

## 5. Firewall (only open what's needed)

```bash
sudo apt-get install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

The API port (5000) is **never** exposed to the host — only Caddy talks to it over the
internal Docker network.

---

## 6. First boot

```bash
cd pathment/server
docker compose up -d --build           # builds the image, starts api + caddy

docker compose ps                      # both should be "running"/"healthy"
docker compose logs -f api             # watch for "✓ Server running on port 5000"
```

**Create the schema (first deploy only)** — `db:sync` builds the schema from the models:

```bash
docker compose run --rm api npm run db:sync
docker compose run --rm api npm run seed:admin     # creates the first admin
# optional: docker compose run --rm api npm run seed:skills
```

> On a *fresh* database use `db:sync`. Do **not** also run migrations on first deploy —
> the models already represent the latest schema. Migrations are for evolving an
> existing DB later.

Verify TLS + health from anywhere:

```bash
curl -s https://api.yourdomain.com/api/health    # {"status":"ok",...}
```

(The cert is issued automatically on the first HTTPS request — give it ~10–30s.)

---

## 7. Point the frontend (Vercel) at the API

In Vercel → your project → Settings → Environment Variables, set your API base URL to
`https://api.yourdomain.com` (whatever the client uses, e.g. `NEXT_PUBLIC_API_URL`),
then redeploy. Make sure `CLIENT_URL` on the server includes the exact Vercel domain,
or CORS will block the browser.

---

## 8. Day-2 operations

```bash
# Deploy new code
git pull && docker compose up -d --build

# Logs
docker compose logs -f api
docker compose logs -f caddy

# Restart / stop
docker compose restart api
docker compose down                 # stop everything (keeps the cert volume)

# Run a one-off command in the app environment
docker compose run --rm api npm run test:db
docker compose run --rm api node scripts/seed-demo.js
```

- **Auto-restart:** both services use `restart: unless-stopped`, so they come back after a
  crash or a box reboot (Docker starts on boot by default).
- **Certs persist** in the `caddy_data` volume across restarts/rebuilds.
- **Updates:** `apt-get upgrade` the box periodically; rebuild the image to pick up base
  image security patches.

---

## Notes / honest caveats

- **Single box = single point of failure.** If it goes down, the API is down. For real
  resilience later, run two boxes behind a load balancer, or move to DO App Platform.
- **You own patching, monitoring, and uptime** on this box now. At minimum, check
  `docker compose ps` health and the logs occasionally; consider an uptime pinger on
  `https://api.yourdomain.com/api/health`.
- **Redis isn't needed** — the email queue is Postgres-backed, so ignore the `REDIS_*`
  vars.
- **Backups** live with the managed DB on DO — keep automated backups enabled there.
```
