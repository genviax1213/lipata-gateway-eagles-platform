<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class VisitorSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'visitor_token',
        'session_token',
        'user_id',
        'is_authenticated',
        'ip_hash',
        'user_agent',
        'timezone',
        'screen_width',
        'screen_height',
        'last_page_path',
        'last_page_title',
        'last_referrer',
        'first_seen_at',
        'last_seen_at',
        'total_page_views',
    ];

    protected function casts(): array
    {
        return [
            'is_authenticated' => 'boolean',
            'screen_width' => 'integer',
            'screen_height' => 'integer',
            'first_seen_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'total_page_views' => 'integer',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function pageViews()
    {
        return $this->hasMany(VisitorPageView::class);
    }
}
