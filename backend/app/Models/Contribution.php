<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Contribution extends Model
{
    use HasFactory;

    protected $fillable = [
        'member_id',
        'category',
        'contribution_date',
        'amount',
        'note',
        'beneficiary_member_id',
        'recipient_name',
        'encoded_by_user_id',
        'encoded_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'contribution_date' => 'date',
        'encoded_at' => 'datetime',
    ];

    public function member()
    {
        return $this->belongsTo(Member::class);
    }

    public function encodedBy()
    {
        return $this->belongsTo(User::class, 'encoded_by_user_id');
    }

    public function beneficiaryMember()
    {
        return $this->belongsTo(Member::class, 'beneficiary_member_id');
    }

    public function editRequests()
    {
        return $this->hasMany(ContributionEditRequest::class);
    }
}
