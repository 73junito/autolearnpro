<#
Setup script to clone AUTOMATIC1111 Stable Diffusion WebUI into C:\stable-diffusion-webui

Run this script in an elevated PowerShell prompt. It will:
 - clone the repo if the target folder is missing
 - display next steps to download a model and start the WebUI

This script does not download model weights automatically.
#>

param()

$target = 'C:\stable-diffusion-webui'
if(Test-Path $target){
    Write-Output "Target folder $target already exists. Skipping clone."
} else {
    Write-Output "Cloning AUTOMATIC1111 WebUI into $target..."
    git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git $target
    if($LASTEXITCODE -ne 0){
        Write-Error "git clone failed. Ensure Git is installed and you have network access."
        exit 1
    }
}

Write-Output "`nNext steps (run as yourself):"
Write-Output "1. Download a Stable Diffusion model (.ckpt or .safetensors) and place it in: $target\models\Stable-diffusion\"
Write-Output "   Example model names: v1-5-pruned-ema.ckpt or any .safetensors file."
Write-Output "2. (Optional) Create and activate a Python venv, then install requirements if desired."
Write-Output "3. Start the WebUI by running the included launcher:"
Write-Output "   - On Windows: open PowerShell and run: C:\stable-diffusion-webui\webui-user.bat if present"
Write-Output "   - Or run: python C:\stable-diffusion-webui\launch.py from that folder"
Write-Output "4. When the WebUI is running, the API will usually be available at: http://127.0.0.1:7860/sdapi/v1/"

Write-Output "`nIf you want, run this script and then tell me when the WebUI is up - I'll run the image prompts for you."
