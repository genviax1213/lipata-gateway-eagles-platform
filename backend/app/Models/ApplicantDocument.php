<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApplicantDocument extends Model
{
    use HasFactory;

    protected $fillable = [
        'applicant_id',
        'file_path',
        'original_name',
        'status',
        'review_note',
        'reviewed_by_user_id',
        'reviewed_at',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
    ];

    public function applicant()
    {
        return $this->belongsTo(Applicant::class, 'applicant_id');
    }

    public function reviewedBy()
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }
}
