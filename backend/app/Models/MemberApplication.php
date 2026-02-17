<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MemberApplication extends Model
{
    use HasFactory;

    protected $fillable = [
        'member_number',
        'user_id',
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
        'rejection_reason',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'reviewed_at' => 'datetime',
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

    public function notices()
    {
        return $this->hasMany(ApplicationNotice::class, 'member_application_id');
    }

    public function documents()
    {
        return $this->hasMany(ApplicationDocument::class, 'member_application_id');
    }

    public function feeRequirements()
    {
        return $this->hasMany(ApplicationFeeRequirement::class, 'member_application_id');
    }
}
