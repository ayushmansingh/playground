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

## Sharing it with the team

The launcher shares the dashboard on your LAN by default and prints the address
to send round, for example `http://10.14.32.87:5174`.

If colleagues cannot open it, add the firewall rule once in an elevated
PowerShell:

```powershell
New-NetFirewallRule -DisplayName "HE DIY Dashboard (5174)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5174 -Profile Private,Domain
```

Or start it with `.\start_dashboard.ps1 -OpenFirewall` from an elevated prompt,
which does the same thing.

To keep the dashboard to your own machine, use `.\start_dashboard.ps1 -Local`.

The dashboard has no login, so only share it on a trusted network.
