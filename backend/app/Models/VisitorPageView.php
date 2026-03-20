<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class VisitorPageView extends Model
{
    use HasFactory;

    protected $fillable = [
        'visitor_session_id',
        'visitor_token',
        'user_id',
        'path',
        'page_title',
        'referrer',
        'event_type',
        'viewed_at',
        'is_authenticated',
    ];

    protected function casts(): array
    {
        return [
            'viewed_at' => 'datetime',
            'is_authenticated' => 'boolean',
        ];
    }

    public function session()
    {
        return $this->belongsTo(VisitorSession::class, 'visitor_session_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
