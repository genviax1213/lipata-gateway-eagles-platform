<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MemberClubPosition extends Model
{
    use HasFactory;

    protected $fillable = [
        'member_id',
        'club_position_id',
        'eagle_year',
        'started_at',
        'ended_at',
        'is_current',
    ];

    protected $casts = [
        'started_at' => 'date',
        'ended_at' => 'date',
        'is_current' => 'boolean',
    ];

    public function member()
    {
        return $this->belongsTo(Member::class);
    }

    public function clubPosition()
    {
        return $this->belongsTo(ClubPosition::class);
    }
}
