# lms_api (Elixir)

Prerequisites
- Erlang/OTP and Elixir installed (see options below)

Quick start (Windows)
- Using Chocolatey:
```powershell
choco install erlang
choco install elixir
```

- Using asdf (macOS / Linux / Windows WSL):
```bash
asdf plugin add erlang
asdf install erlang latest
asdf plugin add elixir
asdf install elixir latest
```

Fetch dependencies
```bash
cd "Automotive and Diesel LMS/backend/lms_api"
mix deps.get
```

Notes
- If `mix` is not found, ensure Elixir is on your PATH or run inside WSL where Elixir is installed.
- To run tests:
```bash
mix test
```

CI
- If you want, I can add a GitHub Actions job that runs `mix deps.get` and `mix test` on PRs.
