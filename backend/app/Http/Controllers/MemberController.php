<?php

namespace App\Http\Controllers;

use App\Models\Member;
use App\Support\TextCase;
use Illuminate\Http\Request;

class MemberController extends Controller
{
    private function ensurePermission(Request $request, string $permission): void
    {
        $user = $request->user();
        $email = (string) $user->email;

        if ($email === 'admin@lipataeagles.ph') {
            return;
        }

        if (!$user->hasPermission($permission)) {
            abort(403, 'Insufficient privileges for this action.');
        }
    }

    public function index(Request $request)
    {
        $this->ensurePermission($request, 'members.view');

        $search = (string) $request->query('search', '');
        $status = (string) $request->query('status', '');

        $query = Member::query();

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('member_number', 'like', "%{$search}%")
                  ->orWhere('first_name', 'like', "%{$search}%")
                  ->orWhere('middle_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%");
            });
        }

        if ($status !== '') {
            $query->where('membership_status', $status);
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
        $this->ensurePermission($request, 'members.update');

        $validated = $request->validate([
            'member_number' => 'required|string|max:50|unique:members,member_number,' . $member->id,
            'first_name' => 'required|string|max:120',
            'middle_name' => ['required', 'string', 'min:2', 'max:120', 'not_regex:/\./'],
            'last_name' => 'required|string|max:120',
            'membership_status' => 'required|in:active,inactive,applicant',
        ]);

        $validated['member_number'] = (string) TextCase::upper($validated['member_number']);
        $validated['first_name'] = (string) TextCase::title($validated['first_name']);
        $validated['middle_name'] = (string) TextCase::title($validated['middle_name']);
        $validated['last_name'] = (string) TextCase::title($validated['last_name']);

        $member->update($validated);

        return response()->json($member);
    }

    public function destroy(Request $request, Member $member)
    {
        $this->ensurePermission($request, 'members.delete');

        $member->delete();

        return response()->json(['message' => 'Member deleted']);
    }
}
