<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApplicantBatch extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'start_date',
        'target_completion_date',
        'batch_treasurer_user_id',
        'created_by_user_id',
    ];

    protected $casts = [
        'start_date' => 'date',
        'target_completion_date' => 'date',
    ];

    public function applications()
    {
        return $this->hasMany(MemberApplication::class, 'batch_id');
    }

    public function documents()
    {
        return $this->hasMany(ApplicantBatchDocument::class, 'applicant_batch_id');
    }

    public function batchTreasurer()
    {
        return $this->belongsTo(User::class, 'batch_treasurer_user_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
