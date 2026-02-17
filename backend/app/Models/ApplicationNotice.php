<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApplicationNotice extends Model
{
    use HasFactory;

    protected $fillable = [
        'member_application_id',
        'notice_text',
        'created_by_user_id',
    ];

    public function application()
    {
        return $this->belongsTo(MemberApplication::class, 'member_application_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
