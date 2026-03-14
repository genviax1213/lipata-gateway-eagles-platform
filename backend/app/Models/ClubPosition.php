<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClubPosition extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'code',
        'sort_order',
    ];

    public function assignments()
    {
        return $this->hasMany(MemberClubPosition::class);
    }
}
