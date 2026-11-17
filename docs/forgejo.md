# Forgejo on twelve: plan

Status (2026-11-17): done. Every repo is on Forgejo; GitHub holds only push
mirrors of yank-wars, dajaj and typ; `/srv/git` and the private GitHub repos
are deleted (last night's restic snapshot still has `/srv/git` until it ages
out); clippenberg is deleted everywhere, and so are the old-history repos
(typ-sveltekit, dajaj-angular, squares-github-history, whose commits were
all replayed into the current squares). The steps below are the record.

Traps found on the way:

- The runner module is `services.forgejo-runner` (uuid + token from
  `/admin/actions/runners`), not `services.gitea-actions-runner`, whose
  `--token-file` forgejo-runner 13 rejects silently.
- `host.workdir_parent` must be the real `/var/lib/private/...` path: git
  matches `actions/checkout`'s `includeIf gitdir:` credentials against the
  resolved path, so under DynamicUser's symlink the fetch gets 401.
- Forgejo's API has run status (`/actions/tasks`) but no job logs.
- A `write:repository` token can't delete a repo; that stays in the web UI.

## Goal

One home for every repo: Forgejo on `twelve`, public web UI behind the
existing tunnel, CI on twelve's own runner, covered by the nightly backup.
GitHub only mirrors the public projects.

## Facts it rests on (checked 2026-11-17)

- twelve's nixpkgs has `services.forgejo` (Forgejo 16.0.6, LTS 15.0.10),
  `services.forgejo.dump`, and `services.gitea-actions-runner` with
  `forgejo-runner` 13.2.0. Forgejo's default database is SQLite.
- twelve: i5-8500T (6 cores), 15 GB RAM (12 free), 277 GB free, 1.5 TB backup
  disk. yank-wars' full suite already ran on it.
- The nightly restic already covers `/var/backup/dumps`; `squares` refuses to
  build until a new state directory is backed up or deliberately ignored.
- Repos today:

  | Repo | twelve | GitHub | Difference |
  |---|---|---|---|
  | squares | 667 commits | private | **diverged**: 202 commits only on GitHub, 483 only on twelve |
  | clippenberg | yes | private | identical |
  | dontstudy | yes | private | identical |
  | rssism | yes | private | twelve has 1 more |
  | typ | yes | private (3 branches) | twelve has 1 more; GitHub's branches add nothing |
  | moloch, lsel | yes | no | |
  | dajaj | Angular history | public (new history) | separate histories by design |
  | yank-wars | no | public | |

## Steps

1. **Install** (`squares`): Forgejo on loopback, SQLite, sign-ups closed,
   `git.sammysul.com` on the tunnel; pushes over SSH through the tailnet,
   public clones over HTTPS. Daily `forgejo dump` into `/var/backup/dumps`
   (a consistent copy for restic, never the live database). VM-tested, built on
   twelve without switching, then deployed by Sammy.
2. **Admin account**: Sammy creates it (one command); the SSH key is the
   personal one.
3. **Copy every repo** from twelve's `/srv/git` with all branches and tags,
   then compare refs commit by commit against the source. squares' GitHub line
   goes in as `squares-github-history` and dajaj's Angular line as
   `dajaj-angular`, both archived (read-only). Nothing is deleted in this step.
4. **Switch over**, one repo at a time: local `origin`, `squares`' flake
   inputs, and the deploy updaters (they follow tags from Forgejo instead of
   GitHub).
5. **CI**: the runner on twelve, one job at a time, running workflows from
   `.forgejo/workflows/` with the host's Nix (its warm store makes runs
   faster). The release step uses Forgejo's API instead of `gh`.
6. **Mirrors**: Forgejo push-mirrors yank-wars and dajaj to GitHub; GitHub's
   Actions are switched off there.
7. **Retire the old homes**, only after Sammy confirms each: `/srv/git`
   becomes a tarball on the backup disk, then is removed; the private GitHub
   repos are deleted one by one.

## Risks

- twelve becomes the single point for git, CI and deploys; local clones keep
  working when it is down.
- The backup disk is inside twelve: a lost machine loses both. GitHub mirrors
  cover the public projects; private repos need an off-site copy later.
- A public forge is a target: sign-ups closed, the admin account with a strong
  password and 2FA, updates through `squares` like everything else.
