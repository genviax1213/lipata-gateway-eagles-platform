<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Applicant extends Model
{
    use HasFactory;

    public const STATUS_PENDING_VERIFICATION = 'pending_verification';
    public const STATUS_UNDER_REVIEW = 'under_review';
    public const STATUS_OFFICIAL_APPLICANT = 'official_applicant';
    public const STATUS_ELIGIBLE_FOR_ACTIVATION = 'eligible_for_activation';
    public const STATUS_ACTIVATED = 'activated';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_WITHDRAWN = 'withdrawn';

    public const OPEN_STATUSES = [
        self::STATUS_PENDING_VERIFICATION,
        self::STATUS_UNDER_REVIEW,
        self::STATUS_OFFICIAL_APPLICANT,
        self::STATUS_ELIGIBLE_FOR_ACTIVATION,
    ];

    public const ARCHIVED_STATUSES = [
        self::STATUS_ACTIVATED,
        self::STATUS_REJECTED,
        self::STATUS_WITHDRAWN,
    ];

    protected $fillable = [
        'member_number',
        'user_id',
        'member_id',
        'batch_id',
        'first_name',
        'middle_name',
        'last_name',
        'email',
        'membership_status',
        'status',
        'decision_status',
        'current_stage',
        'is_login_blocked',
        'verification_token',
        'email_verified_at',
        'reviewed_by_user_id',
        'reviewed_at',
        'activated_at',
        'activated_by_user_id',
        'rejection_reason',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'reviewed_at' => 'datetime',
        'activated_at' => 'datetime',
        'is_login_blocked' => 'boolean',
    ];

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function member()
    {
        return $this->belongsTo(Member::class);
    }

    public function batch()
    {
        return $this->belongsTo(ApplicantBatch::class, 'batch_id');
    }

    public function activatedBy()
    {
        return $this->belongsTo(User::class, 'activated_by_user_id');
    }

    public function notices()
    {
        return $this->hasMany(ApplicantNotice::class, 'applicant_id');
    }

    public function documents()
    {
        return $this->hasMany(ApplicantDocument::class, 'applicant_id');
    }

    public function feeRequirements()
    {
        return $this->hasMany(ApplicantFeeRequirement::class, 'applicant_id');
    }

    public function scopeOwnedByUser(Builder $query, User $user): Builder
    {
        return $query
            ->where('user_id', $user->id)
            ->orWhereRaw('LOWER(TRIM(email)) = ?', [strtolower(trim((string) $user->email))]);
    }

    public function setEmailAttribute(?string $value): void
    {
        $this->attributes['email'] = $value === null ? null : Str::of($value)->trim()->lower()->value();
    }
}
