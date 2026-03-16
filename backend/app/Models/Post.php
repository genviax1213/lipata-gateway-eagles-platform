<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Post extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'slug',
        'section',
        'post_type',
        'excerpt',
        'content',
        'image_path',
        'video_provider',
        'video_source_url',
        'video_embed_url',
        'video_thumbnail_url',
        'video_thumbnail_text',
        'is_featured',
        'show_on_homepage_community',
        'show_on_announcement_bar',
        'announcement_text',
        'announcement_audience',
        'announcement_expires_at',
        'send_push_notification',
        'push_notification_sent_at',
        'status',
        'published_at',
        'author_id',
    ];

    protected $casts = [
        'is_featured' => 'boolean',
        'show_on_homepage_community' => 'boolean',
        'show_on_announcement_bar' => 'boolean',
        'announcement_audience' => 'string',
        'announcement_expires_at' => 'datetime',
        'send_push_notification' => 'boolean',
        'push_notification_sent_at' => 'datetime',
        'published_at' => 'datetime',
    ];

    public function author()
    {
        return $this->belongsTo(User::class, 'author_id');
    }
}
