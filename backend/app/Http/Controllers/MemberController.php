<?php

namespace App\Http\Controllers;

use App\Models\Member;
use App\Support\TextCase;
use Illuminate\Http\Request;

class MemberController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewMemberDirectory', Member::class);

        $search = (string) $request->query('search', '');
        $status = (string) $request->query('status', '');

        $query = Member::query();

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('member_number', 'like', "%{$search}%")
                  ->orWhere('first_name', 'like', "%{$search}%")
                  ->orWhere('middle_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('spouse_name', 'like', "%{$search}%")
                  ->orWhere('contact_number', 'like', "%{$search}%")
                  ->orWhere('batch', 'like', "%{$search}%")
                  ->orWhere('address', 'like', "%{$search}%");
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
        $validated = $request->validate([
            'member_number' => 'required|string|max:50|unique:members,member_number,' . $member->id,
            'first_name' => 'required|string|max:120',
            'middle_name' => ['required', 'string', 'min:2', 'max:120', 'not_regex:/\./'],
            'last_name' => 'required|string|max:120',
            'membership_status' => 'required|in:active,inactive,applicant',
            'spouse_name' => 'nullable|string|max:120',
            'contact_number' => 'nullable|string|max:50',
            'address' => 'nullable|string|max:65535',
            'date_of_birth' => 'nullable|date',
            'batch' => 'nullable|string|max:120',
            'induction_date' => 'nullable|date',
        ]);

        $validated['member_number'] = (string) TextCase::upper($validated['member_number']);
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

        $member->update($validated);

        return response()->json($member);
    }

    public function destroy(Request $request, Member $member)
    {
        $member->delete();

        return response()->json(['message' => 'Member deleted']);
    }
}
