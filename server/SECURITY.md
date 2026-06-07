# Securely deploying the backend on a **shared** DigitalOcean VPS

Your situation: a DO Droplet that **other people also have accounts on**, and a DO managed
Postgres in the **same region but a different DO account**. Goal: deploy the backend so the
other users can't see your code, secrets, or containers — only you.

---

## ⚠️ Read this first — it decides whether this is even possible

**You cannot hide anything from a user who has `root`/`sudo` on the box.** Root can read any
file (including `.env`), dump any process's memory/environment, and inspect any container.
The **`docker` group is root-equivalent** too — a member can mount the host's `/` into a
container and read everything.

So:

- **If any other user has `sudo`/root, or is in the `docker` group** → real secrecy is
  impossible on this box. Use a **separate Droplet** for this backend (cheap, and it's the
  only honest answer). Don't put production secrets on a box other admins control.
- **If the other users are non-root standard users** (no sudo, not in `docker` group) → you
  *can* isolate everything under your own account. The rest of this guide does exactly that.

The mechanism that makes this work for non-root others is **rootless Docker**: the whole stack
runs as *your* Linux user, in *your* home directory, invisible to other unprivileged users.

---

## ✅ Your case: other admins have root → use a separate Droplet (recommended)

You confirmed other users on the 16 GB box have sudo/root. That means **they can read your
secrets there, period** — no configuration changes that. To actually keep things "only me",
host production on a box only you control. Best concrete setup:

1. **Create a new Droplet on the SAME DO account as the database**, same region. Small is
   plenty for this Node API + Caddy — **2 vCPU / 2–4 GB** comfortably runs it (size up later if
   traffic grows). You alone get SSH access (your key only).
2. **Put it in the same VPC as the DB** (same account + region = free private networking).
   Now the API reaches Postgres over the **private network** — the DB never needs to be on the
   public internet at all.
3. **DB Trusted Sources:** add the new droplet **by name** (works because it's the same
   account). You can then remove any public-IP trusted sources entirely.
4. **Deploy with the same Docker + Caddy files** in this folder. Regular (rootful) Docker is
   fine here since you're the only user — rootless is optional belt-and-suspenders.
5. **Keep the 16 GB shared box for non-secret work** — CI, builds, staging seeded with *dummy*
   credentials. Never the real `.env`.

A dedicated $12–24/mo droplet is cheap insurance against leaking your prod DB creds and JWT
secrets to other admins. If you can't create the droplet on the DB's account, make it on your
own account and use the cross-account IP-allowlist + `sslmode=require` approach in §3.

The sections below (rootless Docker, file perms) are the fallback for when the *other* users
are **non-root** — keep them for reference, but for your situation, the separate Droplet above
is the move.

---

## 1. Run everything as you, with **rootless Docker**

Rootless Docker runs the daemon + containers under your UID — no system daemon, no `docker`
group, nothing other users can reach.

```bash
# as YOUR user (not root)
sudo apt-get update && sudo apt-get install -y uidmap dbus-user-session docker-ce-rootless-extras
dockerd-rootless-setuptool.sh install
# make it persist after you log out, and start on boot:
sudo loginctl enable-linger "$USER"
systemctl --user enable docker

# point your shell at the rootless socket (add to ~/.bashrc)
echo 'export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock' >> ~/.bashrc
echo 'export PATH=/usr/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
docker info | grep -i rootless    # should say "rootless"
```

**Let rootless bind 80/443** (Caddy needs them; rootless can't use ports <1024 by default):

```bash
echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/99-rootless-ports.conf
sudo sysctl --system
```

> This one-time step needs sudo. If you don't have sudo either, run Caddy on `8080/8443` and
> ask whoever owns the box to port-forward 80→8080 / 443→8443, or to run a single shared
> reverse proxy. But ideally you have sudo and the *other* users don't.

Now `docker` / `docker compose` commands you run are yours alone — other users running
`docker ps` see nothing of yours.

---

## 2. Lock down the files

```bash
# keep the project in YOUR home, not /opt or /srv (which others may read)
git clone <repo> ~/pathment
chmod 700 ~/pathment ~/pathment/server     # only you can even enter the dir
cd ~/pathment/server
cp .env.example .env
chmod 600 .env                              # only you can read the secrets
```

- Secrets live **only** in `.env` (mode 600, owned by you). They are **never** baked into the
  image — `.dockerignore` already excludes `.env`, and compose injects it at runtime.
- Never commit `.env`. Never paste secrets into chat, tickets, or shell history
  (prefer `nano .env` over `export SECRET=...`).
- `chmod 700` on your home dir too if it isn't already: `chmod 700 ~`.

A non-root user running `cat ~you/pathment/server/.env` now gets **permission denied**.

---

## 3. Cross-account managed Postgres (the right way)

Because the DB is on a **different DO account**, you can't add the Droplet by name in Trusted
Sources — add its **public IP** instead.

```bash
# on the VPS, find the egress/public IP the DB will see:
curl -4 -s ifconfig.me ; echo
```

Then on the **DB's** DO account → Databases → your DB → **Settings → Trusted Sources** →
add that IP. This firewalls the DB to *only* your VPS.

- Keep **`?sslmode=require`** in `DATABASE_URL` — traffic crosses the public internet between
  accounts (same region, so it's fast), so TLS is mandatory.
- **Use a least-privilege DB user**, not `doadmin`. In the DB console:
  ```sql
  CREATE ROLE pathment_app LOGIN PASSWORD '<strong-random>';
  GRANT CONNECT ON DATABASE <db> TO pathment_app;
  GRANT USAGE, CREATE ON SCHEMA public TO pathment_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pathment_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pathment_app;
  ```
  (The app needs CREATE on first deploy for `db:sync`; you can revoke CREATE afterward.)
- Put that user's connection string in `.env`. Rotate the password if it was ever shared.

---

## 4. Network surface — keep it minimal

- The API container uses `expose` (internal only) in `docker-compose.yml` — port 5000 is
  **never** published to the host. Only Caddy publishes 80/443.
- Firewall the box (needs sudo; if the box owner manages ufw, ask them):
  ```bash
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
  ```
- The container already runs as a **non-root user** inside (see `Dockerfile`), so even a
  container escape isn't instantly root.

---

## 5. SSH + box hygiene (do what your access allows)

- SSH in with **keys only**; if you control sshd: `PasswordAuthentication no`,
  `PermitRootLogin no`. Install `fail2ban`.
- Enable unattended security updates: `sudo apt-get install -y unattended-upgrades`.
- Don't add anyone (including yourself) to a system `docker` group — rootless avoids it.

---

## 6. (Optional) encrypt secrets at rest

If you want protection even against *future* root access or disk snapshots, encrypt `.env`
instead of leaving it plaintext:

- **sops + age**: keep `.env.enc` in the repo, decrypt to `.env` only at deploy time, shred
  after `docker compose up`. Or
- **A secrets file outside the repo** on an encrypted volume.

For a single owner-managed box this is usually overkill; mode-600 + rootless covers the
stated threat (other non-root users on the same box).

---

## 7. Verify the isolation

Have a *different* (non-root) user on the box try:

```bash
cat /home/<you>/pathment/server/.env     # -> Permission denied
docker ps                                # -> their own (none) — can't see your rootless containers
ls /home/<you>/pathment                  # -> Permission denied
```

If all three are denied, you're isolated from the other non-root users. (Again: this does
**not** protect you from a root user — for that, you need your own box.)

---

## Deploy (same as DEPLOY.md, but rootless)

```bash
cd ~/pathment/server
nano .env                                   # API_DOMAIN, CLIENT_URL, DATABASE_URL(sslmode=require), JWT_*, etc.
docker compose up -d --build
docker compose run --rm api npm run db:sync      # first deploy only
docker compose run --rm api npm run seed:admin
curl -s https://api.yourdomain.com/api/health
```

DNS: point `api.yourdomain.com` (A record) at the VPS public IP (in whichever account holds
the domain — yours).
