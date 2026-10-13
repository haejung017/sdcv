#!/usr/bin/env bash
# Clones each project in config.json with its read-only deploy key (secret KEY_<NAME>).
# A repo that fails is skipped; count.mjs then keeps its old numbers and marks it stale.
set -u
dest="$1"
mkdir -p "$dest"
keydir="$(mktemp -d)"
trap 'rm -rf "$keydir"' EXIT
node -e 'for (const p of require("./config.json").projects) console.log(p.name, p.repo)' |
while read -r name repo; do
  var="KEY_$(echo "$name" | tr '[:lower:]' '[:upper:]')"
  key="${!var:-}"
  if [ -z "$key" ]; then echo "::warning::Secret $var is missing; skipping $name"; continue; fi
  printf '%s\n' "$key" > "$keydir/$name"
  chmod 600 "$keydir/$name"
  if GIT_SSH_COMMAND="ssh -i $keydir/$name -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
     git clone --quiet "git@github.com:$repo.git" "$dest/$name"; then
    echo "Cloned $name"
  else
    echo "::warning::Could not clone $name"
  fi
done
