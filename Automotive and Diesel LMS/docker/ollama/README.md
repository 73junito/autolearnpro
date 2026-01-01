Usage

Put your local ollama model manifests and model directories into one of these host paths:
- D:/Automotive and Diesel LMS/ollama_models
- D:/Automotive and Diesel LMS/ollama models

Or set the environment variable `HOST_OLLAMA_HOME` to your preferred folder before running compose.

PowerShell example:

```powershell
$env:HOST_OLLAMA_HOME = 'D:/Automotive and Diesel LMS/ollama_models'
cd docker/ollama
docker compose up -d
```

This will run an Ollama container with the host folder mounted to `/root/.ollama` inside the container so the CLI/server can find model manifests.
