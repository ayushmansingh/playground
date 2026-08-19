# Run HE DIY Dashboard On Another Laptop

## Prerequisites

- Python 3
- Node.js
- VPN/network access to `common-redash.mmt.live` only if you want live refresh

## Steps

1. Extract the zip.
2. Open PowerShell in the extracted `he_diy_dashboard` folder.
3. Optional for live refresh: copy `.env.example` to `.env` and replace `YOUR_COMMON_REDASH_API_KEY`.
4. Run:

```powershell
.\start_dashboard.ps1
```

5. Open:

```text
http://127.0.0.1:5174/
```

The dashboard works from the bundled cached snapshot even without `.env`. The Refresh Redash button needs `.env` and Redash network access.
