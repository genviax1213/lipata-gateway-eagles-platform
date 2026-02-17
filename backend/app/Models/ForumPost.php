<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ForumPost extends Model
{
    use HasFactory;

    protected $fillable = [
        'thread_id',
        'body',
        'created_by_user_id',
        'is_hidden',
    ];

    protected $casts = [
        'is_hidden' => 'boolean',
    ];

    public function thread()
    {
        return $this->belongsTo(ForumThread::class, 'thread_id');
    }

    public function author()
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
