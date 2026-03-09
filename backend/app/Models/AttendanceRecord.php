<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AttendanceRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'calendar_event_id',
        'attendee_user_id',
        'member_id',
        'applicant_id',
        'scanned_by_user_id',
        'source',
        'scanned_at',
    ];

    protected $casts = [
        'scanned_at' => 'datetime',
    ];

    public function event()
    {
        return $this->belongsTo(CalendarEvent::class, 'calendar_event_id');
    }

    public function attendee()
    {
        return $this->belongsTo(User::class, 'attendee_user_id');
    }

    public function member()
    {
        return $this->belongsTo(Member::class);
    }

    public function applicant()
    {
        return $this->belongsTo(Applicant::class);
    }

    public function scannedBy()
    {
        return $this->belongsTo(User::class, 'scanned_by_user_id');
    }
}
