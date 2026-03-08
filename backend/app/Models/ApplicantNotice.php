<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApplicantNotice extends Model
{
    use HasFactory;

    protected $fillable = [
        'applicant_id',
        'notice_text',
        'visibility',
        'created_by_user_id',
    ];

    public function applicant()
    {
        return $this->belongsTo(Applicant::class, 'applicant_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
