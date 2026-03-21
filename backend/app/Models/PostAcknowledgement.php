<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PostAcknowledgement extends Model
{
    protected $fillable = [
        'post_id',
        'user_id',
        'acknowledged_at',
    ];

    protected $casts = [
        'acknowledged_at' => 'datetime',
    ];

    public function post()
    {
        return $this->belongsTo(Post::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
