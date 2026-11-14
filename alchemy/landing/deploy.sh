#!/usr/bin/env bash
# Plan or deploy the hosti landing stack. Run from omarchy only (for now): it
# reaches hetzner-manager over ssh and Cloudflare through the Alchemy profile.
#
# Alchemy keeps local state in <cwd>/.alchemy/state. localState() takes no
# path in beta.87, so ./.alchemy/state is a symlink to
# ~/.local/share/alchemy/state (mode 0700), outside the repo. That root is
# shared with other stacks; Alchemy files state under <stack>/<stage>/, so
# stack names must differ.
#
#   ./deploy.sh plan   <vX.Y.Z> <host>
#   ./deploy.sh deploy <vX.Y.Z> <host> [--yes]
#   ./deploy.sh drift  <vX.Y.Z> <host> [--yes]
#
# <vX.Y.Z> is the release whose image ghcr.io/jakubszwajka/hosti:landing-<vX.Y.Z>
# runs. <host> is hosti.kubaszwajka.com or hosti-next.kubaszwajka.com.
# Extra args go to alchemy after `--stage prod`. Agents (pi on PATH, CI,
# non-TTY) get no approval prompt, so they pass --yes, and only after a human
# said yes to that exact deploy. --stage and --profile are refused: the stage is
# always prod, and the profile comes from ALCHEMY_PROFILE.
set -Eeuo pipefail
cd "$(dirname "$0")"

usage() {
  echo "usage: $0 plan|deploy|drift <vX.Y.Z> <host> [alchemy flags, e.g. --yes]" >&2
  exit 2
}

action="${1:-}"
case "$action" in
  plan | deploy | drift) ;;
  *) usage ;;
esac
[ "$#" -ge 3 ] || usage
version="$2"
host="$3"
shift 3

if ! [[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "refusing: version '$version' is not vX.Y.Z" >&2
  exit 2
fi
case "$host" in
  hosti.kubaszwajka.com | hosti-next.kubaszwajka.com) ;;
  *)
    echo "refusing: host '$host' is not hosti.kubaszwajka.com or hosti-next.kubaszwajka.com" >&2
    exit 2
    ;;
esac
for arg in "$@"; do
  case "$arg" in
    --stage | --stage=* | --profile | --profile=*)
      echo "refusing: $arg; the stage is always prod and the profile comes from ALCHEMY_PROFILE" >&2
      exit 2
      ;;
  esac
done

state_root="${HOME}/.local/share/alchemy/state"
install -d -m 0700 "$state_root"
chmod 0700 "$state_root"
mkdir -p .alchemy
if [ -L .alchemy/state ]; then
  target="$(readlink .alchemy/state)"
  if [ "$target" != "$state_root" ]; then
    echo "refusing: .alchemy/state points to $target, expected $state_root" >&2
    exit 1
  fi
elif [ -e .alchemy/state ]; then
  echo "refusing: .alchemy/state is not a symlink; move its contents to $state_root and remove it" >&2
  exit 1
else
  ln -s "$state_root" .alchemy/state
fi

export LANDING_VERSION="$version"
export LANDING_HOST="$host"

[ -d node_modules ] || bun install --frozen-lockfile
exec bunx alchemy "$action" --stage prod "$@"
