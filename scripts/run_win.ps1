param(
  [Parameter(Mandatory=$true)][string]$InputDir,
  [Parameter(Mandatory=$true)][string]$OutputDir,
  [int]$EyesLevel = 2,
  [int]$FocusLevel = 2,
  [int]$BlurLevel = 2,
  [int]$ExposureLevel = 2,
  [int]$DuplicateLevel = 0
)

python -m pip install -r requirements.txt
python -m ktk_select.cli run `
  --input "$InputDir" `
  --output "$OutputDir" `
  --eyes-level "$EyesLevel" `
  --focus-level "$FocusLevel" `
  --blur-level "$BlurLevel" `
  --exposure-level "$ExposureLevel" `
  --duplicate-level "$DuplicateLevel" `
  --ai-mode off

Write-Host "Done. See: $OutputDir/result.csv and $OutputDir/summary.json"
