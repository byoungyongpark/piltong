$root = $PSScriptRoot
$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$port/"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css"
  ".js"   = "application/javascript"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".json" = "application/json"
  ".ico"  = "image/x-icon"
  ".otf"  = "font/otf"
  ".ttf"  = "font/ttf"
  ".woff" = "font/woff"
  ".woff2" = "font/woff2"
  ".mp4"  = "video/mp4"
  ".mp3"  = "audio/mpeg"
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $req = $context.Request
  $res = $context.Response
  $path = $req.Url.AbsolutePath
  if ($path -eq "/") { $path = "/index.html" }
  $filePath = Join-Path $root ([Uri]::UnescapeDataString($path.TrimStart('/')))

  if (Test-Path $filePath -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($filePath)
    $contentType = $mime[$ext]
    if (-not $contentType) { $contentType = "application/octet-stream" }
    $res.ContentType = $contentType
    $res.SendChunked = $false
    $res.Headers.Set("Accept-Ranges", "bytes")

    # <audio>/<video> elements issue Range requests (for seeking, and
    # some browsers even for the very first fetch) — this server used
    # to always send the WHOLE file with the full length as
    # Content-Length regardless, which crashed .NET's HttpListener
    # ("bytes to be written... exceed the specified Content-Length")
    # once a large file (Quiet Innovation.mp3) was actually requested
    # with a real Range header, since the client then expects a 206
    # partial response, not the full body.
    $fileLength = (Get-Item $filePath).Length
    $rangeHeader = $req.Headers["Range"]

    if ($rangeHeader -and $rangeHeader -match "bytes=(\d*)-(\d*)") {
      $start = if ($matches[1]) { [int64]$matches[1] } else { 0 }
      $end = if ($matches[2]) { [int64]$matches[2] } else { $fileLength - 1 }
      if ($end -gt $fileLength - 1) { $end = $fileLength - 1 }
      $length = $end - $start + 1

      $res.StatusCode = 206
      $res.Headers.Set("Content-Range", "bytes $start-$end/$fileLength")
      $res.ContentLength64 = $length

      $stream = [System.IO.File]::OpenRead($filePath)
      $stream.Seek($start, [System.IO.SeekOrigin]::Begin) | Out-Null
      $buffer = New-Object byte[] 65536
      $remaining = $length
      while ($remaining -gt 0) {
        $toRead = [Math]::Min($buffer.Length, $remaining)
        $read = $stream.Read($buffer, 0, $toRead)
        if ($read -le 0) { break }
        $res.OutputStream.Write($buffer, 0, $read)
        $remaining -= $read
      }
      $stream.Close()
    } else {
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } else {
    $res.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
    $res.OutputStream.Write($msg, 0, $msg.Length)
  }
  $res.OutputStream.Close()
}
