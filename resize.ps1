Add-Type -AssemblyName System.Drawing
$imgPath = "C:\Users\pc\.gemini\antigravity\scratch\phone_sales_app\icon.jpg"
$img = [System.Drawing.Image]::FromFile($imgPath)

# 192x192
$bmp192 = New-Object System.Drawing.Bitmap 192, 192
$graph192 = [System.Drawing.Graphics]::FromImage($bmp192)
$graph192.DrawImage($img, 0, 0, 192, 192)
$bmp192.Save("C:\Users\pc\.gemini\antigravity\scratch\phone_sales_app\icon-192.png", [System.Drawing.Imaging.ImageFormat]::Png)
$graph192.Dispose()
$bmp192.Dispose()

# 512x512
$bmp512 = New-Object System.Drawing.Bitmap 512, 512
$graph512 = [System.Drawing.Graphics]::FromImage($bmp512)
$graph512.DrawImage($img, 0, 0, 512, 512)
$bmp512.Save("C:\Users\pc\.gemini\antigravity\scratch\phone_sales_app\icon-512.png", [System.Drawing.Imaging.ImageFormat]::Png)
$graph512.Dispose()
$bmp512.Dispose()

$img.Dispose()
Write-Host "Images resized and saved successfully."
