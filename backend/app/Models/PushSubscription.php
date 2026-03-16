<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PushSubscription extends Model
{
    protected $fillable = [
        'endpoint_hash',
        'endpoint',
        'public_key',
        'auth_token',
        'content_encoding',
        'subscribed_at',
        'last_notified_at',
        'user_agent',
    ];

    protected $casts = [
        'subscribed_at' => 'datetime',
        'last_notified_at' => 'datetime',
    ];
}
