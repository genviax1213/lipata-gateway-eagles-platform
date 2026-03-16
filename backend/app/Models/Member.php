<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use App\Traits\Auditable;

class Member extends Model
{
    use HasFactory, Auditable;

    protected $fillable = [
        'member_number',
        'first_name',
        'nickname',
        'middle_name',
        'last_name',
        'spouse_name',
        'email',
        'email_verified',
        'password_set',
        'user_id',
        'membership_status',
        'contact_number',
        'telephone_number',
        'emergency_contact_number',
        'address',
        'address_line',
        'street_no',
        'barangay',
        'city_municipality',
        'province',
        'zip_code',
        'date_of_birth',
        'place_of_birth',
        'civil_status',
        'height_cm',
        'weight_kg',
        'citizenship',
        'religion',
        'blood_type',
        'region',
        'hobbies',
        'special_skills',
        'batch',
        'induction_date',
        'source_submitted_at',
    ];

    protected $casts = [
        'email_verified' => 'boolean',
        'password_set' => 'boolean',
        'source_submitted_at' => 'datetime',
        'height_cm' => 'decimal:2',
        'weight_kg' => 'decimal:2',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function contributions()
    {
        return $this->hasMany(Contribution::class);
    }

    public function employments()
    {
        return $this->hasMany(MemberEmployment::class)->orderByDesc('is_current')->orderBy('id');
    }

    public function dependents()
    {
        return $this->hasMany(MemberDependent::class)->orderBy('sort_order')->orderBy('id');
    }

    public function educationEntries()
    {
        return $this->hasMany(MemberEducation::class)->orderBy('id');
    }

    public function sponsorship()
    {
        return $this->hasOne(MemberSponsorship::class);
    }

    public function clubPositionAssignments()
    {
        return $this->hasMany(MemberClubPosition::class)->orderByDesc('is_current')->orderByDesc('started_at')->orderBy('id');
    }

    public function setEmailAttribute(?string $value): void
    {
        $this->attributes['email'] = $value === null ? null : Str::of($value)->trim()->lower()->value();
    }
}
