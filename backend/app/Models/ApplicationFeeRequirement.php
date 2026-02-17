<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApplicationFeeRequirement extends Model
{
    use HasFactory;

    protected $fillable = [
        'member_application_id',
        'required_amount',
        'note',
        'set_by_user_id',
    ];

    protected $casts = [
        'required_amount' => 'decimal:2',
    ];

    public function application()
    {
        return $this->belongsTo(MemberApplication::class, 'member_application_id');
    }

    public function setBy()
    {
        return $this->belongsTo(User::class, 'set_by_user_id');
    }

    public function payments()
    {
        return $this->hasMany(ApplicationFeePayment::class, 'application_fee_requirement_id');
    }
}
