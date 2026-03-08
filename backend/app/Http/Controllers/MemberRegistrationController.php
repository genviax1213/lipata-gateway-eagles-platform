<?php

namespace App\Http\Controllers;

use App\Models\Member;
use App\Models\MemberApplication;
use App\Models\MemberRegistration;
use App\Models\Role;
use App\Models\User;
use App\Notifications\MemberRegistrationVerificationToken;
use App\Support\TextCase;
use App\Support\VerificationToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class MemberRegistrationController extends Controller
{
    private function normalizeName(string $value): string
    {
        return Str::of($value)->lower()->squish()->value();
    }

    private function normalizeEmail(string $value): string
    {
        return Str::of($value)->lower()->trim()->value();
    }

    private function generateMemberNumber(): string
    {
        $prefix = 'LGEC-' . now()->format('Y') . '-';
        $next = 1;

        do {
            $candidate = $prefix . str_pad((string) $next, 5, '0', STR_PAD_LEFT);
            $exists = Member::query()->where('member_number', $candidate)->exists();
            $next++;
        } while ($exists);

        return $candidate;
    }

    public function register(Request $request)
    {
        $validated = $request->validate([
            'first_name' => ['required', 'string', 'min:2', 'max:120', 'regex:/^(?=.*[A-Za-z])[A-Za-z\s\'\-]+$/'],
            'middle_name' => ['required', 'string', 'min:2', 'max:120', 'not_regex:/\./', 'regex:/^(?=.*[A-Za-z])[A-Za-z\s\'\-]+$/'],
            'last_name' => ['required', 'string', 'min:2', 'max:120', 'regex:/^(?=.*[A-Za-z])[A-Za-z\s\'\-]+$/'],
            'email' => 'required|email|max:255',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $normalizedEmail = $this->normalizeEmail($validated['email']);
        $firstName = (string) TextCase::title($validated['first_name']);
        $middleName = (string) TextCase::title($validated['middle_name']);
        $lastName = (string) TextCase::title($validated['last_name']);

        if (User::query()->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])->exists()) {
            return response()->json(['message' => 'A portal account already exists for this email.'], 422);
        }

        if (Member::query()->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])->exists()) {
            return response()->json(['message' => 'A member record already exists for this email.'], 422);
        }

        if (MemberApplication::query()->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])->exists()) {
            return response()->json(['message' => 'This email is already in use by the applicant registration flow.'], 422);
        }

        $nameConflict = Member::query()
            ->whereRaw('LOWER(TRIM(first_name)) = ?', [$this->normalizeName($firstName)])
            ->whereRaw('LOWER(TRIM(COALESCE(middle_name, ""))) = ?', [$this->normalizeName($middleName)])
            ->whereRaw('LOWER(TRIM(last_name)) = ?', [$this->normalizeName($lastName)])
            ->exists();
        if ($nameConflict) {
            return response()->json(['message' => 'A member record with the same full name already exists.'], 422);
        }

        $token = VerificationToken::generate();

        $registration = MemberRegistration::query()->create([
            'first_name' => $firstName,
            'middle_name' => $middleName,
            'last_name' => $lastName,
            'email' => $normalizedEmail,
            'password' => Hash::make((string) $validated['password']),
            'status' => MemberRegistration::STATUS_PENDING_VERIFICATION,
            'verification_token' => hash('sha256', $token),
        ]);

        $registration->notify(new MemberRegistrationVerificationToken($token, $normalizedEmail));

        return response()->json([
            'message' => 'Member registration submitted. Verify your email to activate your portal account.',
            'registration_id' => $registration->id,
        ], 201);
    }

    public function verify(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email|max:255',
            'verification_token' => VerificationToken::validationRules(),
        ]);

        $normalizedEmail = $this->normalizeEmail($validated['email']);
        $normalizedToken = VerificationToken::normalize((string) $validated['verification_token']);

        $registration = MemberRegistration::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])
            ->where('verification_token', hash('sha256', $normalizedToken))
            ->where('status', MemberRegistration::STATUS_PENDING_VERIFICATION)
            ->first();

        if (!$registration) {
            return response()->json([
                'message' => 'Invalid verification details or registration already completed.',
            ], 422);
        }

        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        DB::transaction(function () use ($registration, $memberRole): void {
            $user = User::query()->create([
                'name' => trim($registration->first_name . ' ' . $registration->middle_name . ' ' . $registration->last_name),
                'email' => $registration->email,
                'password' => $registration->password,
                'role_id' => $memberRole->id,
                'finance_role' => null,
                'forum_role' => null,
                'email_verified_at' => now(),
            ]);

            $member = Member::query()->create([
                'member_number' => $this->generateMemberNumber(),
                'first_name' => $registration->first_name,
                'middle_name' => $registration->middle_name,
                'last_name' => $registration->last_name,
                'email' => $registration->email,
                'email_verified' => true,
                'password_set' => true,
                'membership_status' => 'active',
                'user_id' => $user->id,
            ]);

            $registration->status = MemberRegistration::STATUS_COMPLETED;
            $registration->email_verified_at = now();
            $registration->completed_at = now();
            $registration->user_id = $user->id;
            $registration->member_id = $member->id;
            $registration->save();
        });

        return response()->json([
            'message' => 'Email verified. Your member account is now active.',
        ]);
    }
}
