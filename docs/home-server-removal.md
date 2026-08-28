# Remove EPF Sahayak after testing

This is a future teardown guide, **not part of updating the portal**. It removes
the deployed EPF app, its data/secrets and its dedicated tunnel. It does not
delete the GitHub repository or your Windows checkout.

## Keep these untouched

- `/home/shiv/changing-room`
- `changing-room-api.service` and `changing-room-worker.service`
- `cloudflared.service` and the Changing Room tunnel/route `api.changingroom.in`
- Shared Node, Bun, cloudflared binary, PostgreSQL, SSH and network services
- Shared `/etc/cloudflared` and `/home/shiv/.cloudflared` configuration

Do **not** run `cloudflared service uninstall`: this deployment uses a separate
custom service, and the generic command could remove Changing Room's service.

## 1. Connect and confirm the exact targets

```bash
ssh shiv@192.168.31.100
systemctl show epf-sahayak.service -p FragmentPath -p WorkingDirectory --no-pager
systemctl show cloudflared-epf.service -p FragmentPath --no-pager
realpath /home/shiv/epf-sahayak
sudo realpath /etc/cloudflared-epf
```

Expect the EPF app directory `/home/shiv/epf-sahayak`, units
`/etc/systemd/system/epf-sahayak.service` and
`/etc/systemd/system/cloudflared-epf.service`, and tunnel config directory
`/etc/cloudflared-epf`. If anything differs, stop and investigate.

Decide whether you need to retain testing records first. If yes, follow the
stopped-app backup step in [the update guide](home-server-update.md). Retaining a
backup means a copy of the data and secrets still exists; it is not full erasure.

## 2. Stop only the two EPF services

```bash
sudo systemctl disable --now cloudflared-epf.service
sudo systemctl disable --now epf-sahayak.service
systemctl is-active cloudflared-epf.service epf-sahayak.service
```

Expect both inactive (nonzero exit is normal). Do not delete files if either
service is still running. The public EPF site will now be unavailable.

## 3. Remove the dedicated Cloudflare resources

In the Cloudflare dashboard:

1. Open the tunnel named `epf-sahayak`. Verify its ID is
   `9916fcd3-c78b-4865-af6a-64b6ac0cc3fd`.
2. Remove its published application route for **bwmi.shivamcodes.com**.
3. Delete that EPF tunnel after its connector has stopped. Do not delete the
   `changing-room` tunnel.
4. In DNS for `shivamcodes.com`, check for the `bwmi` record. Delete it if still
   present and pointing to
   `9916fcd3-c78b-4865-af6a-64b6ac0cc3fd.cfargotunnel.com`. If it now points to a
   different deployment, stop; do not remove a replacement site's record.
5. If you later added an Access application solely for this testing hostname,
   remove only that application and EPF-only policies. Keep shared policies.

Stopping a tunnel alone does not remove its DNS record; see
[Cloudflare routing documentation](https://developers.cloudflare.com/tunnel/routing/).
Tunnel deletion is a separate resource operation; see
[Cloudflare tunnel deletion](https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/methods/delete/).

## 4. Remove the service files

These commands remove only the two verified EPF unit files:

```bash
sudo rm -i -- /etc/systemd/system/epf-sahayak.service /etc/systemd/system/cloudflared-epf.service
sudo systemctl daemon-reload
```

Answer the prompts only for these exact names. If either unit has a `.service.d`
override directory, inspect it and remove only EPF-specific overrides separately.

## 5. Permanently delete the deployed data and token

**Irreversible without a backup.** This deletes the repository checkout,
`.env.local`, SQLite database, uploaded/local files within the app directory,
dependencies, build output and EPF tunnel token. First inspect the directories
for unexpected mounted storage; do not proceed if either contains a mount or
points to another directory.

```bash
cd /home/shiv
ls -ld /home/shiv/epf-sahayak
sudo ls -ld /etc/cloudflared-epf
findmnt --list --output TARGET
```

After confirming the exact paths and no nested mounts, run these guarded
commands. Each deletion asks for confirmation:

```bash
if [ ! -L /home/shiv/epf-sahayak ] && [ "$(realpath /home/shiv/epf-sahayak)" = /home/shiv/epf-sahayak ]; then
  rm -rI --one-file-system -- /home/shiv/epf-sahayak
fi
if [ ! -L /etc/cloudflared-epf ] && [ "$(sudo realpath /etc/cloudflared-epf)" = /etc/cloudflared-epf ]; then
  sudo rm -rI --one-file-system -- /etc/cloudflared-epf
fi
```

Do not broaden these paths to `/home/shiv`, `/etc`, or a wildcard. Ordinary
deletion is not guaranteed forensic erasure on SSDs or snapshotting filesystems.

## 6. Review residual copies and credentials

- List possible EPF backups without deleting them:
  `find /home/shiv -maxdepth 1 -name 'epf-sahayak*' -print`.
- Review each dated backup, transfer archive or manually created release folder.
  They may contain `.env.local`, databases and old code. Delete only individually
  verified EPF paths you no longer need, using an explicit path and confirmation;
  never pipe this listing into a delete command.
- Remove retained EPF snapshots/backups elsewhere if full data removal is required.
- Revoke an OpenAI API key if it was dedicated to EPF testing. If shared with
  another app, do not revoke it without coordinating that app's replacement key.
- Revoke any GitHub deploy credential created solely for this deployment. Keep
  shared Git credentials and SSH keys.
- Historical system logs can remain under the host's retention policy. Do not
  globally vacuum/delete journals: that would affect unrelated services. If a
  token was pasted into shell history, remove the specific entry privately and
  revoke the credential; do not dump history into chat.

## 7. Confirm removal and preserve the other app

```bash
systemctl status epf-sahayak.service cloudflared-epf.service --no-pager
systemctl is-active changing-room-api.service changing-room-worker.service cloudflared.service
sudo ss -ltnp
```

EPF units should be absent; Changing Room services should remain active. EPF's
port 3000 should no longer be listening (do not kill another app if it later
reuses that port). Shared services and Changing Room's port 4000 stay intact.
