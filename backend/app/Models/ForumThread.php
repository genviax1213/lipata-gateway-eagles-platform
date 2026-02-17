<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ForumThread extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'slug',
        'body',
        'created_by_user_id',
        'is_locked',
        'is_pinned',
        'last_posted_at',
    ];

    protected $casts = [
        'is_locked' => 'boolean',
        'is_pinned' => 'boolean',
        'last_posted_at' => 'datetime',
    ];

    public function author()
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function posts()
    {
        return $this->hasMany(ForumPost::class, 'thread_id');
    }
}
