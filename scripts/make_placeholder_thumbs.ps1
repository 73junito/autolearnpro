# Create placeholder PNG thumbnails using System.Drawing
Add-Type -AssemblyName System.Drawing
$outdir = 'D:\Automotive and Diesel LMS\docs\site\images'
if (-not (Test-Path $outdir)) { New-Item -ItemType Directory -Path $outdir -Force | Out-Null }
$courses = @(
  @{file='course-1.png'; title='Intro to Diesel Engines'; color=[System.Drawing.Color]::FromArgb(40,90,150)},
  @{file='course-2.png'; title='Advanced Engine Diagnostics'; color=[System.Drawing.Color]::FromArgb(80,140,60)},
  @{file='course-3.png'; title='Fuel Systems & Injection'; color=[System.Drawing.Color]::FromArgb(160,60,90)}
)
foreach ($c in $courses) {
  $bmp = New-Object System.Drawing.Bitmap 512,384
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $brush = New-Object System.Drawing.SolidBrush $c.color
  $g.FillRectangle($brush, 0, 0, $bmp.Width, $bmp.Height)
  $font = New-Object System.Drawing.Font 'Arial',24,[System.Drawing.FontStyle]::Bold
  $textBrush = New-Object System.Drawing.SolidBrush [System.Drawing.Color]::White
  $rect = New-Object System.Drawing.RectangleF(20,20,$bmp.Width-40,$bmp.Height-40)
  $stringFormat = New-Object System.Drawing.StringFormat
  $stringFormat.Alignment = [System.Drawing.StringAlignment]::Near
  $stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString($c.title, $font, $textBrush, $rect, $stringFormat)
  $outPath = Join-Path $outdir $c.file
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "Wrote placeholder: $outPath"
}
Write-Host 'Placeholder thumbnails generated.' -ForegroundColor Cyan
