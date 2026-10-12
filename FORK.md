# Fork

This fork carries a few patches on top of upstream's stable releases. The
`patched` branch (the default branch) is always the latest upstream stable tag
plus the fork's commits.

## How releases happen

`.github/workflows/fork-release.yml` builds releases versioned
`<upstream>-fork.<n>`, for example `0.0.45-fork.2`, tagged `v0.0.45-fork.2`.
Each run:

1. Rebases the fork's commits onto upstream's latest stable tag (nightlies and
   previews are ignored) and force-pushes `patched`.
2. Builds the JS bundle, then a signed, notarized macOS arm64 app.
3. Publishes a GitHub release with the DMG, the zip, and `latest-mac.yml`.

It runs hourly and releases `-fork.1` once per new upstream stable release.
Running it by hand always releases the next number, so a patch can ship
without waiting for upstream.

The app's update feed points at this repository, so installed fork builds
offer every new release through the normal in-app update button.

SSH environments run upstream's matching CLI release, so the desktop strips
the `-fork.<n>` suffix when choosing it. Upstream's other CLI paths (the
standalone `t3` service, cloud self-updates, `t3 update`) are not supported.

Upstream's own workflows target its runners and secrets, so the sync job
disables every workflow except this one.

## One-time setup

Repository secrets (Settings → Secrets and variables → Actions):

| Secret             | Value                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FORK_SYNC_TOKEN`  | Fine-grained token for this repository only, with **Contents** and **Workflows** read and write. `GITHUB_TOKEN` cannot push commits that touch workflow files, and every upstream release does. |
| `CSC_LINK`         | Base64 of a `Developer ID Application` certificate exported as `.p12` (`base64 -i cert.p12 \| pbcopy`).                                                                                         |
| `CSC_KEY_PASSWORD` | The `.p12` export password.                                                                                                                                                                     |
| `APPLE_API_KEY`    | Contents of an App Store Connect API key `.p8` (Users and Access → Integrations → Team Keys; the Developer role can notarize).                                                                  |
| `APPLE_API_KEY_ID` | That key's ID.                                                                                                                                                                                  |
| `APPLE_API_ISSUER` | The issuer ID shown above the keys list.                                                                                                                                                        |

No provisioning profile is needed. Upstream's passkey entitlements require an
Associated Domains profile only T3's Apple team can issue, so fork builds sign
without them and in-app browser passkeys stay off.

The first fork build installs over the official app (same bundle ID and data
directory). macOS may ask once to let the newly signed app read its keychain
item; choose Always Allow.

## Adding a patch

```sh
git switch patched
# commit your change
git push origin patched
```

Then run **Fork release** from the Actions tab, or
`gh workflow run fork-release.yml -R adamjhc/t3code`.

## When a rebase fails

The run fails and its summary lists the conflicting files. Resolve locally:

```sh
git fetch upstream --tags
git switch patched && git pull --ff-only origin patched
git rebase --onto vNEW vOLD   # vOLD: git describe --tags --abbrev=0 --exclude '*-*'
# fix conflicts, git rebase --continue
git push --force-with-lease origin patched
```

Then rerun **Fork release**.
