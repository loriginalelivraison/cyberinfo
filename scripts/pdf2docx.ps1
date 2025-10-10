param(
  [Parameter(Mandatory=$true)][string]$InputPdf,
  [Parameter(Mandatory=$true)][string]$OutputDocx
)

$wdFormatXMLDocument = 12  # .docx
$word = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0

  # Ouvre le PDF (Word 2013+ sait "reflow" le PDF en docx)
  $doc = $word.Documents.Open($InputPdf, $false, $true)  # ConfirmConversions:=False, ReadOnly:=True
  $doc.SaveAs([ref]$OutputDocx, [ref]$wdFormatXMLDocument)
  $doc.Close()
  Write-Output "OK"
  exit 0
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
finally {
  if ($word) { $word.Quit() }
}
