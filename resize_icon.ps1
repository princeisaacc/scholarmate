Add-Type -AssemblyName System.Drawing
$src = Join-Path $PSScriptRoot 'assets\icon.png'
if (-Not (Test-Path $src)) { Write-Host "icon.png not found"; exit 1 }
$d = 1024
$img = [System.Drawing.Image]::FromFile($src)
try {
    $bmp = New-Object System.Drawing.Bitmap($d, $d)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.Clear([System.Drawing.Color]::FromArgb(0,0,0,0))
    $scale = [math]::Min($d / $img.Width, $d / $img.Height)
    $newWidth = [int]([math]::Round($img.Width * $scale))
    $newHeight = [int]([math]::Round($img.Height * $scale))
    $x = [int]([math]::Round(($d - $newWidth) / 2))
    $y = [int]([math]::Round(($d - $newHeight) / 2))
    $g.DrawImage($img, [System.Drawing.Rectangle]::new($x, $y, $newWidth, $newHeight), [System.Drawing.Rectangle]::new(0, 0, $img.Width, $img.Height), [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $tmp = Join-Path $PSScriptRoot 'assets\\icon_tmp.png'
    $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Remove-Item $src
    Rename-Item $tmp $src
    Write-Host 'Resized icon.png to 1024x1024 via temp file'
} finally {
    $img.Dispose()
}
