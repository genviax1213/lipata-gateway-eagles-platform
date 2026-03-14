<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MemberEmployment extends Model
{
    use HasFactory;

    protected $fillable = [
        'member_id',
        'office_name',
        'line_of_business',
        'office_address',
        'job_title',
        'office_telephone',
        'office_fax',
        'is_current',
    ];

    protected $casts = [
        'is_current' => 'boolean',
    ];

    public function member()
    {
        return $this->belongsTo(Member::class);
    }
}
