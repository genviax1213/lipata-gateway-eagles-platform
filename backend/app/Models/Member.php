<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use App\Traits\Auditable;

class Member extends Model
{
    use HasFactory, Auditable;

    protected $fillable = [
        'member_number',
        'first_name',
        'middle_name',
        'last_name',
        'spouse_name',
        'email',
        'email_verified',
        'password_set',
        'user_id',
        'membership_status',
        'contact_number',
        'address',
        'date_of_birth',
        'batch',
        'induction_date',
        'source_submitted_at',
    ];

    protected $casts = [
        'email_verified' => 'boolean',
        'password_set' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function contributions()
    {
        return $this->hasMany(Contribution::class);
    }

    public function setEmailAttribute(?string $value): void
    {
        $this->attributes['email'] = $value === null ? null : Str::of($value)->trim()->lower()->value();
    }
}
