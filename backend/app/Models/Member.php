<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Member extends Model
{
    use HasFactory;

    protected $fillable = [
        'member_number',
        'first_name',
        'middle_name',
        'last_name',
        'spouse_name',
        'email',
        'user_id',
        'membership_status',
        'contact_number',
        'address',
        'date_of_birth',
        'batch',
        'induction_date',
        'source_submitted_at',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function contributions()
    {
        return $this->hasMany(Contribution::class);
    }
}
