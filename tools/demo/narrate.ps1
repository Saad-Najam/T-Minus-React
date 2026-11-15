# Renders tools/demo/narration.json to one WAV per cue with the local Windows SAPI voice (no network, no external service).
param([string]$Json = "$PSScriptRoot\narration.json", [string]$Out = "demo-work\audio")
Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$cfg = Get-Content $Json -Raw | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($cfg.voice)
$synth.Rate = [int]$cfg.rate
$synth.Volume = 100
foreach ($c in $cfg.cues) {
  $path = Join-Path (Resolve-Path $Out) ("cue_{0}.wav" -f $c.id)
  $synth.SetOutputToWaveFile($path)
  $synth.Speak($c.text)
  $synth.SetOutputToNull()
}
$synth.Dispose()
Get-ChildItem $Out -Filter cue_*.wav | ForEach-Object { "{0} {1:N1} KB" -f $_.Name, ($_.Length / 1KB) }
