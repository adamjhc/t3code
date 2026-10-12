# Fork

This fork carries a few patches on top of upstream's stable releases. The
`patched` branch (the default branch) is always the latest upstream stable tag
plus the fork's commits.

## How releases happen

`.github/workflows/fork-release.yml` runs hourly. When `pingdotgg/t3code`
publishes a new stable release (nightlies and previews are ignored), it:

1. Rebases the fork's commits onto the new tag and force-pushes `patched`.
2. Builds the JS bundle, then a signed, notarized macOS arm64 app.
3. Publishes the GitHub release `fork-<tag>` with the DMG, the zip, and
   `latest-mac.yml`.

The app's update feed points at this repository, so an installed fork build
offers each new `fork-*` release through the normal in-app update button.

The app version stays identical to upstream's (for example `0.0.45`). SSH
environments and the cloud runtime download the `t3` CLI from upstream's
releases by app version, so a fork-specific version would break them. The
cost: a patch shipped without a new upstream release (rerun with `rebuild`)
replaces the same version, so installed apps do not see it as an update.
Download that DMG by hand.

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

Then run **Fork release** from the Actions tab with `rebuild` checked to
publish it before the next upstream release.

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
