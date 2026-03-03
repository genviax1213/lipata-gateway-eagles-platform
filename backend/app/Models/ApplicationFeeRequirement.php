<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApplicationFeeRequirement extends Model
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
        'member_application_id',
        'category',
        'required_amount',
        'note',
        'set_by_user_id',
    ];

    protected $casts = [
        'required_amount' => 'decimal:2',
    ];

    public function application()
    {
        return $this->belongsTo(MemberApplication::class, 'member_application_id');
    }

    public function setBy()
    {
        return $this->belongsTo(User::class, 'set_by_user_id');
    }

    public function payments()
    {
        return $this->hasMany(ApplicationFeePayment::class, 'application_fee_requirement_id');
    }
}
