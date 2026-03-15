<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApplicantFeePayment extends Model
{
    use HasFactory;

    protected $fillable = [
        'applicant_fee_requirement_id',
        'amount',
        'payment_date',
        'note',
        'verification_status',
        'verification_comment',
        'encoded_by_user_id',
        'verified_by_user_id',
        'verified_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'payment_date' => 'date',
        'verified_at' => 'datetime',
    ];

    public function requirement()
    {
        return $this->belongsTo(ApplicantFeeRequirement::class, 'applicant_fee_requirement_id');
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
