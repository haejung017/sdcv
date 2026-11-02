#!/usr/bin/env bash
# Clones each project in config.json with its read-only deploy key (secret KEY_<NAME>).
# A project with "branch" set is cloned at that branch instead of the default one.
# A repo that fails is skipped; count.mjs then keeps its old numbers and marks it stale.
set -u
dest="$1"
mkdir -p "$dest"
keydir="$(mktemp -d)"
trap 'rm -rf "$keydir"' EXIT
node -e 'for (const p of require("./config.json").projects) console.log(p.name, p.repo, p.branch ?? "")' |
while read -r name repo branch; do
  var="KEY_$(echo "$name" | tr '[:lower:]' '[:upper:]')"
  key="${!var:-}"
  if [ -z "$key" ]; then echo "::warning::Secret $var is missing; skipping $name"; continue; fi
  printf '%s\n' "$key" > "$keydir/$name"
  chmod 600 "$keydir/$name"
  if GIT_SSH_COMMAND="ssh -i $keydir/$name -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
     git clone --quiet ${branch:+--branch "$branch"} "git@github.com:$repo.git" "$dest/$name"; then
    echo "Cloned $name${branch:+ ($branch)}"
  else
    echo "::warning::Could not clone $name"
  fi
done
