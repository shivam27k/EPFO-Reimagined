# Update EPF Sahayak on the home server

These commands are for the Ubuntu server, not Windows PowerShell (except SSH).
Run each step separately and stop if it fails. This is a short-downtime testing
deployment: stop the app before replacing its dependencies or `.next` build.
No automated tests are included in this procedure.

## Deployment details

- Site: https://bwmi.shivamcodes.com
- SSH: `ssh shiv@192.168.31.100`
- Repository: https://github.com/shivam27k/EPFO-Reimagined (branch `main`)
- Folder: `/home/shiv/epf-sahayak`
- App service: `epf-sahayak.service`, listening on `127.0.0.1:3000`
- Tunnel service: `cloudflared-epf.service`
- Private environment: `/home/shiv/epf-sahayak/.env.local`
- SQLite data: `/home/shiv/epf-sahayak/.data/epf-sahayak.db`

Do not stop `cloudflared.service`, `changing-room-api.service`,
`changing-room-worker.service`, or PostgreSQL. They belong to other applications.

## 1. Connect and check the checkout

```bash
ssh shiv@192.168.31.100
cd /home/shiv/epf-sahayak
git branch --show-current
git status --short
git remote get-url origin
git rev-parse HEAD
```

Expect branch `main` and the repository above. An untracked
`epf-sahayak-source.tar.gz` is the old transfer archive and can stay.
If tracked files have local changes, stop and preserve/review them; do not use
`git reset --hard` or overwrite them. Record the current commit for recovery.

## 2. Stop and back up

Tell testers the site will be temporarily unavailable. Keep this SSH session
open: the following backup variable is used later.

```bash
sudo systemctl stop epf-sahayak.service
systemctl is-active epf-sahayak.service
```

Expect `inactive` (the command's nonzero exit code is normal here). Once stopped:

```bash
umask 077
epf_backup=$(mktemp -d /home/shiv/epf-sahayak-backup-XXXXXXXX)
git rev-parse HEAD > "$epf_backup/commit.txt"
tar --exclude='./node_modules' --exclude='./.git' --exclude='./epf-sahayak-source.tar.gz' -czf "$epf_backup/portal.tar.gz" -C /home/shiv/epf-sahayak .
printf 'Backup saved to: %s\n' "$epf_backup"
```

The stopped-app backup includes `.env.local`, the entire SQLite directory
(including any WAL files), source and the old production build. It contains
secrets: keep it private, never commit/upload it publicly. Do not continue if
the backup command failed. Ensure no other process is writing this EPF database.

## 3. Pull and configure

```bash
git pull --ff-only origin main
```

For the public-origin fix, edit the existing environment file:

```bash
nano /home/shiv/epf-sahayak/.env.local
```

Add or update this one setting; keep existing API keys and database settings:

```dotenv
APP_ORIGIN=https://bwmi.shivamcodes.com
```

Use only the origin: no `/login`, query string or credentials. This tells the
assistant which browser origin to accept behind the tunnel. It is not an API
key. Save with Ctrl+O, Enter, then Ctrl+X. Do not paste the file into chat.

```bash
chmod 600 /home/shiv/epf-sahayak/.env.local
bun install --frozen-lockfile
```

If a frozen install fails, stop and report the error; do not regenerate the
lockfile on the server. This origin/voice-error patch needs **no migration**.
For a future release that explicitly adds migrations, after backing up and
before building, run:

```bash
bun run db:migrate
```

Do not run `db:seed` during routine updates; preserve existing testing data.

## 4. Build, then start

```bash
bun run build
```

Only after the build finishes successfully:

```bash
sudo systemctl restart epf-sahayak.service
sudo systemctl status epf-sahayak.service --no-pager
```

Expect `active (running)`. Reopen https://bwmi.shivamcodes.com and hard-refresh
the browser to load the new client. End any old voice session before starting
a new one. A successful build does not by itself prove voice actions work.

No tunnel restart is needed for code or `.env.local` updates. Only if you edited
the systemd unit itself, run `sudo systemctl daemon-reload` before restarting.
The unit's Node executable is
`/home/shiv/.nvm/versions/node/v22.23.1/bin/node`, not `/usr/bin/node`.

## If something fails

Read app logs without dumping environment files or tunnel tokens:

```bash
sudo journalctl -u epf-sahayak.service -n 80 --no-pager
```

If build/install fails, leave the app stopped rather than serving a partially
replaced build. Fix the reported error and repeat install/build/start.
For a tunnel-specific outage, inspect only `cloudflared-epf.service`.
For `ORIGIN_REJECTED`, check the public URL and `APP_ORIGIN`, then restart the
app. For `AUTHENTICATION_REQUIRED`, sign in again. Never bypass confirmation or
origin checks to make voice tools run.

For rollback, keep the backup and recorded commit. Restore into a **new empty
release folder**, install dependencies there and point the EPF unit to that
release, or get help with a reviewed rollback. Do not extract an old snapshot
over a running app or blindly reverse database migrations. Restoring the old
database loses changes made since that backup. Never modify Changing Room to
recover this portal.

When the release is accepted, review and remove obsolete private backups using
the [removal guide](home-server-removal.md). Backups are not deleted automatically.
