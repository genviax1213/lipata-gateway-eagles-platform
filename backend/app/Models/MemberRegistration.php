<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;

class MemberRegistration extends Model
{
    use HasFactory, Notifiable;

    public const STATUS_PENDING_VERIFICATION = 'pending_verification';
    public const STATUS_COMPLETED = 'completed';

    protected $fillable = [
        'first_name',
        'middle_name',
        'last_name',
        'email',
        'password',
        'status',
        'verification_token',
        'email_verified_at',
        'completed_at',
        'member_id',
        'user_id',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    protected $hidden = [
        'password',
        'verification_token',
    ];

    public function setEmailAttribute(?string $value): void
    {
        $this->attributes['email'] = $value === null ? null : Str::of($value)->trim()->lower()->value();
    }
}
