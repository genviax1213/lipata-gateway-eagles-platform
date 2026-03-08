<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApplicantFeeRequirement extends Model
{
    use HasFactory;

    public const CATEGORY_PROJECT = 'project';
    public const CATEGORY_COMMUNITY_SERVICE = 'community_service';
    public const CATEGORY_FELLOWSHIP = 'fellowship';
    public const CATEGORY_FIVE_I_ACTIVITIES = 'five_i_activities';

    public const CATEGORY_LABELS = [
        self::CATEGORY_PROJECT => 'Projects',
        self::CATEGORY_COMMUNITY_SERVICE => 'Community Service',
        self::CATEGORY_FELLOWSHIP => 'Fellowship',
        self::CATEGORY_FIVE_I_ACTIVITIES => "5I Activities",
    ];

    protected $fillable = [
        'applicant_id',
        'category',
        'required_amount',
        'note',
        'set_by_user_id',
    ];

    protected $casts = [
        'required_amount' => 'decimal:2',
    ];

    public function applicant()
    {
        return $this->belongsTo(Applicant::class, 'applicant_id');
    }

    public function setBy()
    {
        return $this->belongsTo(User::class, 'set_by_user_id');
    }

    public function payments()
    {
        return $this->hasMany(ApplicantFeePayment::class, 'applicant_fee_requirement_id');
    }
}
