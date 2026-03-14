<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApplicantDocument extends Model
{
    use HasFactory;

    protected $fillable = [
        'applicant_id',
        'reused_from_document_id',
        'file_path',
        'original_name',
        'document_label',
        'description',
        'reused_under_grace_period',
        'reused_at',
        'status',
        'review_note',
        'reviewed_by_user_id',
        'reviewed_at',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
        'reused_under_grace_period' => 'boolean',
        'reused_at' => 'datetime',
    ];

    public function applicant()
    {
        return $this->belongsTo(Applicant::class, 'applicant_id');
    }

    public function reviewedBy()
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }

    public function reusedFromDocument()
    {
        return $this->belongsTo(self::class, 'reused_from_document_id');
    }
}
