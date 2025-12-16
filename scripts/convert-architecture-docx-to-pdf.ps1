<#
Convert DOCX files in docs/architecture to PDF.
Tries LibreOffice (`soffice`) first, then Word COM automation as fallback.

Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\convert-architecture-docx-to-pdf.ps1
#>

try {
  $src = 'D:\Automotive and Diesel LMS\docs\architecture'
  if (-not (Test-Path $src)) { Write-Host "Source folder not found: $src"; exit 0 }

  $docx = Get-ChildItem -Path $src -Filter '*.docx' -File -ErrorAction SilentlyContinue
  if (!$docx -or $docx.Count -eq 0) { Write-Host "No DOCX files found in $src"; exit 0 }

  $soffice = 'C:\Program Files\LibreOffice\program\soffice.exe'
  if (Test-Path $soffice) {
    Write-Host "LibreOffice found at: $soffice`nConverting with LibreOffice..."
    foreach ($f in $docx) {
      Write-Host "Converting: $($f.Name)" -ForegroundColor Cyan
      & $soffice --headless --convert-to pdf --outdir $src $f.FullName
    }
  } else {
    Write-Host "LibreOffice not found. Attempting Word COM automation..." -ForegroundColor Yellow
    try {
      $word = New-Object -ComObject Word.Application
      $word.Visible = $false
      foreach ($f in $docx) {
        $pdf = [System.IO.Path]::ChangeExtension($f.FullName,'pdf')
        Write-Host "Converting with Word: $($f.Name)" -ForegroundColor Cyan
        $doc = $word.Documents.Open($f.FullName, [ref]$false, [ref]$true)
        $wdFormatPDF = 17
        $doc.SaveAs([ref]$pdf, [ref]$wdFormatPDF)
        $doc.Close()
      }
      $word.Quit()
    } catch {
      Write-Host "Word COM conversion failed: $_" -ForegroundColor Red
      exit 2
    }
  }

  # Add PDFs to git and commit if there are changes
  Write-Host 'Adding PDFs to git...'
  git -C 'D:\Automotive and Diesel LMS' add docs/architecture/*.pdf 2>$null
  $st = git -C 'D:\Automotive and Diesel LMS' status --porcelain
  if ($st) {
    git -C 'D:\Automotive and Diesel LMS' commit -m 'Add architecture PDFs' || Write-Host 'git commit failed'
    Write-Host 'Committed PDFs to git.' -ForegroundColor Green
  } else {
    Write-Host 'No PDFs to commit.'
  }

} catch {
  Write-Host "Unexpected error: $_" -ForegroundColor Red
  exit 1
}
