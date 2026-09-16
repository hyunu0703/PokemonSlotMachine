$ErrorActionPreference = 'Stop'
$root = (Resolve-Path $PSScriptRoot).Path
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://127.0.0.1:4173/')

try {
  $listener.Start()
} catch {
  Write-Host 'http://127.0.0.1:4173 is already in use. Open that address in your browser.' -ForegroundColor Yellow
  Read-Host 'Press Enter to close'
  exit 1
}

$mimeTypes = @{
  '.css' = 'text/css; charset=utf-8'
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.mp3' = 'audio/mpeg'
  '.ogg' = 'audio/ogg'
}

Start-Process 'http://127.0.0.1:4173/'
Write-Host 'Pokemon Slot Collection is running at http://127.0.0.1:4173/' -ForegroundColor Cyan
Write-Host 'Keep this window open while using the game. Press Ctrl+C to stop.'

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($requestPath)) { $requestPath = 'index.html' }
    $target = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $requestPath))
    $rootPrefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $target.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not [IO.File]::Exists($target)) {
      $context.Response.StatusCode = 404
      $context.Response.Close()
      continue
    }
    $extension = [IO.Path]::GetExtension($target).ToLowerInvariant()
    $context.Response.ContentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
    $bytes = [IO.File]::ReadAllBytes($target)
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  }
} finally {
  $listener.Close()
}
