<?php

namespace App\Http\Controllers;

use App\Models\CalendarEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class CalendarEventController extends Controller
{
    private const CALENDAR_TIMEZONE = 'Asia/Manila';

    public function publicIndex()
    {
        $events = CalendarEvent::query()
            ->where('starts_at', '>=', now(self::CALENDAR_TIMEZONE)->subDay()->format('Y-m-d H:i:s'))
            ->orderBy('starts_at')
            ->limit(30)
            ->get()
            ->map(fn (CalendarEvent $event) => $this->publicEventPayload($event));

        return response()->json(['data' => $events]);
    }

    public function index()
    {
        $events = CalendarEvent::query()
            ->withCount('attendanceRecords')
            ->with(['createdBy:id,name'])
            ->orderBy('starts_at')
            ->get()
            ->map(fn (CalendarEvent $event) => $this->eventPayload($event));

        return response()->json(['data' => $events]);
    }

    public function store(Request $request)
    {
        $validated = $this->validatedPayload($request);

        $event = CalendarEvent::query()->create([
            ...$validated,
            'created_by_user_id' => $request->user()->id,
            'updated_by_user_id' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Calendar event created.',
            'event' => $this->eventPayload($event->fresh()->loadCount('attendanceRecords')->load('createdBy:id,name')),
        ], 201);
    }

    public function update(Request $request, CalendarEvent $calendarEvent)
    {
        if ($calendarEvent->attendanceRecords()->exists()) {
            return response()->json([
                'message' => 'Events with attendance records are immutable and cannot be edited.',
            ], 422);
        }

        $validated = $this->validatedPayload($request);
        $calendarEvent->fill($validated);
        $calendarEvent->updated_by_user_id = $request->user()->id;
        $calendarEvent->save();

        return response()->json([
            'message' => 'Calendar event updated.',
            'event' => $this->eventPayload($calendarEvent->fresh()->loadCount('attendanceRecords')->load('createdBy:id,name')),
        ]);
    }

    public function destroy(CalendarEvent $calendarEvent)
    {
        if ($calendarEvent->attendanceRecords()->exists()) {
            return response()->json([
                'message' => 'Events with attendance records are immutable and cannot be deleted.',
            ], 422);
        }

        $calendarEvent->delete();

        return response()->json([
            'message' => 'Calendar event deleted.',
        ]);
    }

    private function validatedPayload(Request $request): array
    {
        $validated = $request->validate([
            'title' => 'required|string|min:3|max:160',
            'event_type' => 'required|in:meeting,activity,event',
            'starts_at' => 'required|date',
            'ends_at' => 'nullable|date|after_or_equal:starts_at',
            'location' => 'nullable|string|max:160',
            'description' => 'nullable|string|max:5000',
        ]);

        $validated['starts_at'] = $this->normalizeForStorage($validated['starts_at']);
        $validated['ends_at'] = isset($validated['ends_at']) && $validated['ends_at'] !== null
            ? $this->normalizeForStorage($validated['ends_at'])
            : null;

        return $validated;
    }

    private function eventPayload(CalendarEvent $event): array
    {
        return [
            'id' => $event->id,
            'title' => $event->title,
            'event_type' => $event->event_type,
            'starts_at' => $this->serializeForClient($event->getRawOriginal('starts_at')),
            'ends_at' => $this->serializeForClient($event->getRawOriginal('ends_at')),
            'location' => $event->location,
            'description' => $event->description,
            'attendance_count' => (int) ($event->attendance_records_count ?? $event->attendanceRecords()->count()),
            'is_immutable' => ($event->attendance_records_count ?? $event->attendanceRecords()->count()) > 0,
            'created_by' => $event->createdBy ? [
                'id' => $event->createdBy->id,
                'name' => $event->createdBy->name,
            ] : null,
        ];
    }

    private function publicEventPayload(CalendarEvent $event): array
    {
        return [
            'id' => $event->id,
            'title' => $event->title,
            'event_type' => $event->event_type,
            'starts_at' => $this->serializeForClient($event->getRawOriginal('starts_at')),
            'ends_at' => $this->serializeForClient($event->getRawOriginal('ends_at')),
            'location' => $event->location,
            'description' => $event->description,
        ];
    }

    private function normalizeForStorage(string $value): string
    {
        return Carbon::parse($value)
            ->setTimezone(self::CALENDAR_TIMEZONE)
            ->format('Y-m-d H:i:s');
    }

    private function serializeForClient(?string $value): ?string
    {
        if (!$value) {
            return null;
        }

        return Carbon::createFromFormat('Y-m-d H:i:s', $value, self::CALENDAR_TIMEZONE)
            ->utc()
            ->toISOString();
    }
}
