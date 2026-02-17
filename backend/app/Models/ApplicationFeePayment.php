<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApplicationFeePayment extends Model
{
    use HasFactory;

    protected $fillable = [
        'application_fee_requirement_id',
        'amount',
        'payment_date',
        'note',
        'encoded_by_user_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'payment_date' => 'date',
    ];

    public function requirement()
    {
        return $this->belongsTo(ApplicationFeeRequirement::class, 'application_fee_requirement_id');
    }

    public function encodedBy()
    {
        return $this->belongsTo(User::class, 'encoded_by_user_id');
    }
}
