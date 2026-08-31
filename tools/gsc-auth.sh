#!/usr/bin/env bash
# One-time consent: grants this machine the Search Console scopes that
# tools/gsc.js needs. Opens a browser; add --no-launch-browser if it cannot.
set -e
S=openid
S=$S,https://www.googleapis.com/auth/userinfo.email
S=$S,https://www.googleapis.com/auth/cloud-platform
S=$S,https://www.googleapis.com/auth/webmasters
S=$S,https://www.googleapis.com/auth/siteverification
gcloud auth application-default login --project=myautoracer --scopes="$S" "$@"
