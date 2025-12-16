# Generating course thumbnails with Stable Diffusion

This repository includes a convenience script to generate PNG thumbnails for the static site under `docs/site/images`.

Supported providers
- Hugging Face Inference API (`HF_TOKEN` environment variable required)
- Local Automatic1111 WebUI (`http://127.0.0.1:7860`) with sdapi endpoints enabled

Script
- `docs/site/scripts/generate-sd-thumbnails.ps1`

Usage examples

1) Use a local AUTOMATIC1111 WebUI (recommended when running locally):

```powershell
Set-Location 'D:\Automotive and Diesel LMS\docs\site\scripts'
.\generate-sd-thumbnails.ps1 -Provider webui
```

2) Use Hugging Face Inference API (you must have an API token):

```powershell
$env:HF_TOKEN = 'hf_...'
Set-Location 'D:\Automotive and Diesel LMS\docs\site\scripts'
.\generate-sd-thumbnails.ps1 -Provider hf
```

Notes and tips
- Output files: `docs/site/images/course-1.png`, `course-2.png`, `course-3.png`.
- The script writes to an absolute path for convenience; you can edit the script to change dimensions, prompts, or output location.
- If you use the Hugging Face API and get rate or model availability errors, try switching to a different stable-diffusion variant on HF or use your local WebUI.
- Generating images may use significant CPU/GPU resources on your machine if running locally.

Security
- Never commit secrets (API tokens) into the repository. Use environment variables as shown above.

Want different prompts?
- Edit the `$Prompts` array at the top of the script to customize text prompts used to produce each thumbnail.
