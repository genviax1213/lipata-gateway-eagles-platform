<?php

namespace App\Support;

use Illuminate\Support\Str;

class TextCase
{
    public static function title(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = Str::of($value)->trim()->squish()->value();
        if ($trimmed === '') {
            return '';
        }

        return Str::of($trimmed)->lower()->title()->value();
    }

    public static function upper(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = Str::of($value)->trim()->squish()->value();
        if ($trimmed === '') {
            return '';
        }

        return Str::upper($trimmed);
    }
}
