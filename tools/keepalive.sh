#!/bin/sh
# Keeps the free Supabase project awake: free projects are paused after 7 days with no
# visitors, and a paused field shows "resting" to every child until someone restores it.
# One small read is enough. Run it at least every few days (see README: keep-alive).
set -eu
curl -fsS -X POST 'https://uwhqcqyferxicsjftfeq.supabase.co/rest/v1/rpc/field_counts' \
  -H 'apikey: sb_publishable_ZY_7LDbGP93l7FTGDVbW2A_U4oMopR6' -H 'Content-Type: application/json' -d '{}'
echo
