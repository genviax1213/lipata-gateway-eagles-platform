<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class MemberRegistrationAccessEvent extends Model
{
    protected $fillable = [
        'user_id',
        'member_registration_id',
        'visitor_token',
        'session_token',
        'email',
        'event_type',
        'status',
        'route_path',
        'tab',
        'message',
        'ip_hash',
        'user_agent',
        'occurred_at',
    ];

    protected $casts = [
        'occurred_at' => 'datetime',
    ];

    public function setEmailAttribute(?string $value): void
    {
        $this->attributes['email'] = $value === null ? null : Str::of($value)->trim()->lower()->value();
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function memberRegistration()
    {
        return $this->belongsTo(MemberRegistration::class);
    }
}
