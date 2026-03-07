<?php

namespace App\Http\Controllers;

use App\Models\Member;
use App\Models\MemberApplication;
use App\Models\User;
use App\Support\TextCase;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MemberController extends Controller
{
    private function normalizeEmail(string $value): string
    {
        return Str::of($value)->lower()->trim()->value();
    }

    public function index(Request $request)
    {
        $this->authorize('viewMemberDirectory', Member::class);

        $search = (string) $request->query('search', '');
        $status = (string) $request->query('status', '');
        $emailVerified = $request->query('email_verified');
        $passwordSet = $request->query('password_set');

        $query = Member::query();

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('member_number', 'like', "%{$search}%")
                  ->orWhere('first_name', 'like', "%{$search}%")
                  ->orWhere('middle_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('spouse_name', 'like', "%{$search}%")
                  ->orWhere('contact_number', 'like', "%{$search}%")
                  ->orWhere('batch', 'like', "%{$search}%")
                  ->orWhere('address', 'like', "%{$search}%");
            });
        }

        if ($status !== '') {
            $query->where('membership_status', $status);
        }
        if ($emailVerified !== null && $emailVerified !== '') {
            $query->where('email_verified', filter_var($emailVerified, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? false);
        }
        if ($passwordSet !== null && $passwordSet !== '') {
            $query->where('password_set', filter_var($passwordSet, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? false);
        }

        return response()->json(
            $query->orderBy('last_name')->orderBy('first_name')->paginate(10)
        );
    }

    public function store(Request $request)
    {
        return response()->json([
            'message' => 'Direct member creation is disabled. Use member application approval workflow.',
        ], 422);
    }

    public function update(Request $request, Member $member)
    {
        if ($request->filled('email')) {
            $request->merge(['email' => $this->normalizeEmail((string) $request->input('email', ''))]);
        }

        $validated = $request->validate([
            'member_number' => 'required|string|max:50|unique:members,member_number,' . $member->id,
            'email' => 'nullable|email|max:255|unique:members,email,' . $member->id,
            'first_name' => 'required|string|max:120',
            'middle_name' => ['required', 'string', 'min:2', 'max:120', 'not_regex:/\./'],
            'last_name' => 'required|string|max:120',
            'membership_status' => 'sometimes|required|in:active,inactive,applicant',
            'email_verified' => 'sometimes|boolean',
            'password_set' => 'sometimes|boolean',
            'spouse_name' => 'nullable|string|max:120',
            'contact_number' => 'nullable|string|max:50',
            'address' => 'nullable|string|max:65535',
            'date_of_birth' => 'nullable|date',
            'batch' => 'nullable|string|max:120',
            'induction_date' => 'nullable|date',
        ]);

        $validated['member_number'] = (string) TextCase::upper($validated['member_number']);
        $validated['email'] = isset($validated['email']) && $validated['email'] !== ''
            ? $this->normalizeEmail((string) $validated['email'])
            : (string) ($member->email ?? '');
        $validated['first_name'] = (string) TextCase::title($validated['first_name']);
        $validated['middle_name'] = (string) TextCase::title($validated['middle_name']);
        $validated['last_name'] = (string) TextCase::title($validated['last_name']);
        $validated['spouse_name'] = isset($validated['spouse_name']) && $validated['spouse_name'] !== ''
            ? (string) TextCase::title($validated['spouse_name'])
            : null;
        $validated['contact_number'] = isset($validated['contact_number']) && $validated['contact_number'] !== ''
            ? preg_replace('/\s+/', '', (string) $validated['contact_number'])
            : null;
        $validated['address'] = isset($validated['address']) && $validated['address'] !== ''
            ? trim((string) $validated['address'])
            : null;
        $validated['batch'] = isset($validated['batch']) && $validated['batch'] !== ''
            ? (string) TextCase::title($validated['batch'])
            : null;

        try {
            DB::transaction(function () use ($member, $validated): void {
                $previousEmail = (string) ($member->email ?? '');
                $member->update($validated);

                if ($member->user_id) {
                    User::query()
                        ->where('id', $member->user_id)
                        ->update([
                            'email' => $validated['email'],
                            'email_verified_at' => ($validated['email_verified'] ?? $member->email_verified) ? now() : null,
                        ]);
                }

                $member->email_verified = (bool) ($validated['email_verified'] ?? $member->email_verified);
                $member->password_set = (bool) ($validated['password_set'] ?? $member->password_set);
                $member->save();

                $applicationQuery = MemberApplication::query();
                if ($member->user_id) {
                    $applicationQuery->where('user_id', $member->user_id);
                    if ($previousEmail !== '') {
                        $applicationQuery->orWhereRaw('LOWER(TRIM(email)) = ?', [$previousEmail]);
                    }
                } else {
                    $applicationQuery->whereRaw('LOWER(TRIM(email)) = ?', [$previousEmail]);
                }
                $applicationQuery->update(['email' => $validated['email']]);
            });
        } catch (QueryException $exception) {
            return response()->json([
                'message' => 'Email is already linked to another portal account.',
            ], 422);
        }

        return response()->json($member);
    }

    public function destroy(Request $request, Member $member)
    {
        $this->authorize('manageAdminUsers', [User::class, 'users.manage']);
        $member->delete();

        return response()->json(['message' => 'Member deleted']);
    }
}
