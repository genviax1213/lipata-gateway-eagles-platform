<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApplicantBatchDocument extends Model
{
    use HasFactory;

    protected $fillable = [
        'applicant_batch_id',
        'file_path',
        'original_name',
        'uploaded_by_user_id',
    ];

    public function batch()
    {
        return $this->belongsTo(ApplicantBatch::class, 'applicant_batch_id');
    }

    public function uploadedBy()
    {
        return $this->belongsTo(User::class, 'uploaded_by_user_id');
    }
}
