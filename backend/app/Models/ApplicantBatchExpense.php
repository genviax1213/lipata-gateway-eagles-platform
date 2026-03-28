<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class ApplicantBatchExpense extends Model
{
    use HasFactory;

    public const CATEGORY_LOGISTICS = 'logistics';
    public const CATEGORY_DOCUMENTS = 'documents';
    public const CATEGORY_TRAINING = 'training';
    public const CATEGORY_EVENT = 'event';
    public const CATEGORY_MISC = 'misc';

    public const CATEGORY_LABELS = [
        self::CATEGORY_LOGISTICS => 'Logistics',
        self::CATEGORY_DOCUMENTS => 'Documents',
        self::CATEGORY_TRAINING => 'Training',
        self::CATEGORY_EVENT => 'Event',
        self::CATEGORY_MISC => 'Miscellaneous',
    ];

    protected $fillable = [
        'applicant_batch_id',
        'category',
        'expense_date',
        'description',
        'amount',
        'note',
        'support_reference',
        'approval_reference',
        'verification_status',
        'verification_comment',
        'encoded_by_user_id',
        'verified_by_user_id',
        'verified_at',
    ];

    protected $casts = [
        'expense_date' => 'date',
        'amount' => 'decimal:2',
        'verified_at' => 'datetime',
    ];

    public static function categoryLabels(): array
    {
        return self::CATEGORY_LABELS;
    }

    public static function normalizeCategory(string $value): string
    {
        $normalized = Str::of($value)
            ->lower()
            ->trim()
            ->replaceMatches('/[^a-z0-9]+/', '_')
            ->trim('_')
            ->value();

        return $normalized !== '' ? $normalized : self::CATEGORY_MISC;
    }

    public function getCategoryLabelAttribute(): string
    {
        return self::CATEGORY_LABELS[$this->category] ?? Str::of($this->category)
            ->replace(['_', '-'], ' ')
            ->squish()
            ->title()
            ->value();
    }

    public function batch()
    {
        return $this->belongsTo(ApplicantBatch::class, 'applicant_batch_id');
    }

    public function encodedBy()
    {
        return $this->belongsTo(User::class, 'encoded_by_user_id');
    }

    public function verifiedBy()
    {
        return $this->belongsTo(User::class, 'verified_by_user_id');
    }
}
