<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Notifications\ContactInquiryNotification;
use App\Support\RoleHierarchy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;

class ContactInquiryController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|min:2|max:120',
            'email' => 'required|email:rfc|max:160',
            'subject' => 'nullable|string|max:160',
            'message' => 'required|string|min:10|max:5000',
        ]);

        $recipients = User::query()
            ->whereNotNull('email')
            ->whereHas('role', function ($query) {
                $query->whereIn('name', [
                    RoleHierarchy::SUPERADMIN,
                    RoleHierarchy::ADMIN,
                    RoleHierarchy::SECRETARY,
                    RoleHierarchy::OFFICER,
                ]);
            })
            ->get();

        if ($recipients->isEmpty()) {
            return response()->json([
                'message' => 'No inquiry recipients are configured for contact submissions.',
            ], 503);
        }

        Notification::send($recipients, new ContactInquiryNotification(
            name: trim((string) $validated['name']),
            email: trim((string) $validated['email']),
            subject: trim((string) ($validated['subject'] ?? '')),
            messageBody: trim((string) $validated['message']),
        ));

        return response()->json([
            'message' => 'Inquiry sent successfully.',
        ], 201);
    }
}
