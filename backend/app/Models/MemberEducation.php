<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MemberEducation extends Model
{
    use HasFactory;

    protected $table = 'member_education';

    protected $fillable = [
        'member_id',
        'level',
        'school_name',
        'course',
        'date_graduated',
    ];

    protected $casts = [
        'date_graduated' => 'date',
    ];

    public function member()
    {
        return $this->belongsTo(Member::class);
    }
}
