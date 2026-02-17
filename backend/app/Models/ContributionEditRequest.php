<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ContributionEditRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'contribution_id',
        'requested_amount',
        'reason',
        'requested_by_user_id',
        'status',
        'reviewed_by_user_id',
        'reviewed_at',
        'review_notes',
    ];

    protected $casts = [
        'requested_amount' => 'decimal:2',
        'reviewed_at' => 'datetime',
    ];

    public function contribution()
    {
        return $this->belongsTo(Contribution::class);
    }

    public function requestedBy()
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function reviewedBy()
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }
}

