<?php

namespace App\Models;

use App\Traits\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class FormalPhoto extends Model
{
    use HasFactory, Auditable;

    protected $fillable = [
        'user_id',
        'disk',
        'file_path',
        'mime_type',
        'file_size',
        'width',
        'height',
        'template_key',
    ];

    protected $casts = [
        'file_size' => 'integer',
        'width' => 'integer',
        'height' => 'integer',
    ];

    protected static function booted(): void
    {
        static::deleting(function (FormalPhoto $formalPhoto): void {
            $disk = $formalPhoto->disk ?: 'local';

            if ($formalPhoto->file_path && Storage::disk($disk)->exists($formalPhoto->file_path)) {
                Storage::disk($disk)->delete($formalPhoto->file_path);
            }
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function toMetadataArray(bool $includeOwnerRoute = false): array
    {
        $disk = $this->disk ?: 'local';
        $fileExists = $this->file_path
            ? Storage::disk($disk)->exists($this->file_path)
            : false;

        $payload = [
            'id' => $this->id,
            'mime_type' => $this->mime_type,
            'file_size' => $this->file_size,
            'width' => $this->width,
            'height' => $this->height,
            'template_key' => $this->template_key,
            'status' => $fileExists ? 'saved' : 'missing_file',
            'file_exists' => $fileExists,
            'created_at' => optional($this->created_at)?->toJSON(),
            'updated_at' => optional($this->updated_at)?->toJSON(),
            'image_url' => route('formal-photos.show-image', ['formalPhoto' => $this->id], false),
            'upload_url' => route('formal-photos.store', [], false),
            'upload_field_name' => 'photo',
        ];

        if ($includeOwnerRoute) {
            $payload['owner_image_url'] = route('formal-photos.my-image', [], false);
        }

        return $payload;
    }
}
