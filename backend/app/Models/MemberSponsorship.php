<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MemberSponsorship extends Model
{
    use HasFactory;

    protected $fillable = [
        'member_id',
        'sponsor_member_id',
        'sponsor_name',
        'sponsor_date',
        'sponsor_signature_name',
        'applicant_signature_name',
        'applicant_signed_at',
    ];

    protected $casts = [
        'sponsor_date' => 'date',
        'applicant_signed_at' => 'date',
    ];

    public function member()
    {
        return $this->belongsTo(Member::class);
    }

    public function sponsorMember()
    {
        return $this->belongsTo(Member::class, 'sponsor_member_id');
    }
}
