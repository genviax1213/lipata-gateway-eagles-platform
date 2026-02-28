<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ImageUploadOptimizer
{
    public static function storeOptimizedOrOriginal(
        UploadedFile $file,
        string $directory,
        string $disk = 'public',
        int $maxWidth = 1920,
        int $maxHeight = 1920,
        int $quality = 82,
        bool $convertToWebp = false,
        ?int $targetMaxBytes = null
    ): string {
        $mime = (string) $file->getMimeType();
        if (!in_array($mime, ['image/jpeg', 'image/png'], true)) {
            return $file->store($directory, $disk);
        }

        if (
            !function_exists('imagecreatetruecolor')
            || !function_exists('imagecopyresampled')
            || !function_exists('imagejpeg')
            || !function_exists('imagepng')
        ) {
            return $file->store($directory, $disk);
        }

        $sourcePath = $file->getRealPath();
        if (!$sourcePath) {
            return $file->store($directory, $disk);
        }

        $sourceImage = $mime === 'image/jpeg'
            ? @imagecreatefromjpeg($sourcePath)
            : @imagecreatefrompng($sourcePath);
        if (!$sourceImage) {
            return $file->store($directory, $disk);
        }

        if ($mime === 'image/jpeg') {
            $sourceImage = self::applyJpegOrientation($sourceImage, $sourcePath);
        }

        $srcW = imagesx($sourceImage);
        $srcH = imagesy($sourceImage);
        [$targetW, $targetH] = self::fitDimensions($srcW, $srcH, $maxWidth, $maxHeight);

        $targetImage = $sourceImage;
        if ($targetW !== $srcW || $targetH !== $srcH) {
            $targetImage = imagecreatetruecolor($targetW, $targetH);
            if (!$targetImage) {
                imagedestroy($sourceImage);
                return $file->store($directory, $disk);
            }

            if ($mime === 'image/png') {
                imagealphablending($targetImage, false);
                imagesavealpha($targetImage, true);
                $transparent = imagecolorallocatealpha($targetImage, 0, 0, 0, 127);
                imagefilledrectangle($targetImage, 0, 0, $targetW, $targetH, $transparent);
            }

            imagecopyresampled($targetImage, $sourceImage, 0, 0, 0, 0, $targetW, $targetH, $srcW, $srcH);
        }

        $outputMime = $mime;
        if ($convertToWebp && function_exists('imagewebp')) {
            $outputMime = 'image/webp';
        }

        $binary = self::encodeImage($targetImage, $outputMime, $quality);
        $binary = self::shrinkToTargetSize($targetImage, $outputMime, $quality, $binary, $targetMaxBytes);

        if ($targetImage !== $sourceImage) {
            imagedestroy($targetImage);
        }
        imagedestroy($sourceImage);

        if ($binary === null) {
            return $file->store($directory, $disk);
        }

        $extension = match ($outputMime) {
            'image/webp' => 'webp',
            'image/jpeg' => 'jpg',
            default => 'png',
        };
        $path = trim($directory, '/') . '/' . Str::uuid() . '.' . $extension;
        Storage::disk($disk)->put($path, $binary);

        return $path;
    }

    private static function shrinkToTargetSize($image, string $mime, int $quality, ?string $binary, ?int $targetMaxBytes): ?string
    {
        if ($binary === null || $targetMaxBytes === null || $targetMaxBytes < 1024) {
            return $binary;
        }

        if (strlen($binary) <= $targetMaxBytes) {
            return $binary;
        }

        if (!in_array($mime, ['image/jpeg', 'image/webp'], true)) {
            return $binary;
        }

        $best = $binary;

        for ($q = max(30, min(95, $quality) - 7); $q >= 30; $q -= 5) {
            $candidate = self::encodeImage($image, $mime, $q);
            if ($candidate === null) {
                continue;
            }

            if (strlen($candidate) < strlen($best)) {
                $best = $candidate;
            }

            if (strlen($candidate) <= $targetMaxBytes) {
                return $candidate;
            }
        }

        return $best;
    }

    private static function fitDimensions(int $width, int $height, int $maxWidth, int $maxHeight): array
    {
        if ($width <= 0 || $height <= 0 || ($width <= $maxWidth && $height <= $maxHeight)) {
            return [max(1, $width), max(1, $height)];
        }

        $ratio = min($maxWidth / $width, $maxHeight / $height);

        return [
            max(1, (int) floor($width * $ratio)),
            max(1, (int) floor($height * $ratio)),
        ];
    }

    private static function applyJpegOrientation($image, string $sourcePath)
    {
        if (!function_exists('exif_read_data') || !function_exists('imagerotate')) {
            return $image;
        }

        $exif = @exif_read_data($sourcePath);
        $orientation = (int) ($exif['Orientation'] ?? 1);

        $rotated = null;
        if ($orientation === 3) {
            $rotated = imagerotate($image, 180, 0);
        } elseif ($orientation === 6) {
            $rotated = imagerotate($image, -90, 0);
        } elseif ($orientation === 8) {
            $rotated = imagerotate($image, 90, 0);
        }

        if ($rotated) {
            imagedestroy($image);
            return $rotated;
        }

        return $image;
    }

    private static function encodeImage($image, string $mime, int $quality): ?string
    {
        $quality = max(10, min(95, $quality));
        ob_start();

        $ok = false;
        if ($mime === 'image/jpeg') {
            imageinterlace($image, true);
            $ok = imagejpeg($image, null, $quality);
        } elseif ($mime === 'image/png') {
            $compression = max(0, min(9, (int) round((100 - $quality) * 9 / 100)));
            $ok = imagepng($image, null, $compression);
        } elseif ($mime === 'image/webp' && function_exists('imagewebp')) {
            $ok = imagewebp($image, null, $quality);
        }

        $data = ob_get_clean();
        if (!$ok || !is_string($data) || $data === '') {
            return null;
        }

        return $data;
    }
}
