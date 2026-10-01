# KeenOnCoins Silver Capture Station — SWISH Connected

This version uses the existing SWISH OnSpace/Supabase backend.

Flow:
Capture obverse + reverse → authenticate to SWISH → swish-identify → Numista verification → swish-market-value → save to the existing `items` inventory.

No second database is created.
