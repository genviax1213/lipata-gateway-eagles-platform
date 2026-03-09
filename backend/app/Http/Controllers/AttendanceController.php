<?php

namespace App\Http\Controllers;

use App\Models\AttendanceRecord;
use App\Models\CalendarEvent;
use App\Support\IdentityQrToken;
use Illuminate\Http\Request;

class AttendanceController extends Controller
{
    public function roster(CalendarEvent $calendarEvent)
    {
        $records = AttendanceRecord::query()
            ->with(['attendee:id,name,email', 'member:id,member_number,first_name,middle_name,last_name,email,batch', 'applicant:id,first_name,middle_name,last_name,email,status,batch_id', 'scannedBy:id,name'])
            ->where('calendar_event_id', $calendarEvent->id)
            ->orderBy('scanned_at')
            ->get()
            ->map(fn (AttendanceRecord $record) => $this->recordPayload($record));

        return response()->json([
            'event' => [
                'id' => $calendarEvent->id,
                'title' => $calendarEvent->title,
                'event_type' => $calendarEvent->event_type,
                'starts_at' => optional($calendarEvent->starts_at)?->toISOString(),
            ],
            'data' => $records,
        ]);
    }

    public function scan(Request $request, CalendarEvent $calendarEvent)
    {
        $validated = $request->validate([
            'qr_token' => 'required|string|min:16|max:2000',
        ]);

        $resolved = IdentityQrToken::resolve($validated['qr_token']);
        if (!$resolved) {
            return response()->json([
                'message' => 'Invalid QR code.',
            ], 422);
        }

        $user = $resolved['user'];
        $record = AttendanceRecord::query()->firstOrCreate(
            [
                'calendar_event_id' => $calendarEvent->id,
                'attendee_user_id' => $user->id,
            ],
            [
                'member_id' => $resolved['member']?->id,
                'applicant_id' => $resolved['applicant']?->id,
                'scanned_by_user_id' => $request->user()->id,
                'source' => 'qr',
                'scanned_at' => now(),
            ],
        );

        if (!$record->wasRecentlyCreated) {
            return response()->json([
                'message' => 'Attendance already recorded for this user.',
                'record' => $this->recordPayload($record->fresh()->load(['attendee:id,name,email', 'member:id,member_number,first_name,middle_name,last_name,email,batch', 'applicant:id,first_name,middle_name,last_name,email,status,batch_id', 'scannedBy:id,name'])),
            ], 200);
        }

        return response()->json([
            'message' => 'Attendance recorded.',
            'record' => $this->recordPayload($record->fresh()->load(['attendee:id,name,email', 'member:id,member_number,first_name,middle_name,last_name,email,batch', 'applicant:id,first_name,middle_name,last_name,email,status,batch_id', 'scannedBy:id,name'])),
        ], 201);
    }

    private function recordPayload(AttendanceRecord $record): array
    {
        $subjectType = $record->member ? 'member' : ($record->applicant ? 'applicant' : 'user');
        $subjectName = $record->member
            ? trim($record->member->first_name . ' ' . ($record->member->middle_name ? $record->member->middle_name . ' ' : '') . $record->member->last_name)
            : ($record->applicant
                ? trim($record->applicant->first_name . ' ' . ($record->applicant->middle_name ? $record->applicant->middle_name . ' ' : '') . $record->applicant->last_name)
                : (string) ($record->attendee?->name ?? 'Unknown User'));

        return [
            'id' => $record->id,
            'subject_type' => $subjectType,
            'subject_name' => $subjectName,
            'member_number' => $record->member?->member_number,
            'email' => $record->member?->email ?? $record->applicant?->email ?? $record->attendee?->email,
            'batch' => $record->member?->batch,
            'applicant_status' => $record->applicant?->status,
            'scanned_at' => optional($record->scanned_at)?->toISOString(),
            'scanned_by' => $record->scannedBy ? [
                'id' => $record->scannedBy->id,
                'name' => $record->scannedBy->name,
            ] : null,
        ];
    }
}
