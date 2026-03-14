<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MemberDependent extends Model
{
    use HasFactory;

    protected $fillable = [
        'member_id',
        'name',
        'relationship',
        'age',
        'contact_number',
        'sort_order',
    ];

    public function member()
    {
        return $this->belongsTo(Member::class);
    }
}
