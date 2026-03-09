<?php

namespace App\Http\Controllers;

use App\Support\IdentityQrToken;
use Illuminate\Http\Request;

class IdentityQrController extends Controller
{
    public function showMine(Request $request)
    {
        $user = $request->user()->loadMissing('role:id,name', 'memberProfile', 'applicationProfile');

        $subjectType = $user->memberProfile ? 'member' : ($user->applicationProfile ? 'applicant' : 'user');
        $subjectName = trim(($user->memberProfile?->first_name ?? $user->applicationProfile?->first_name ?? $user->name) . ' ' . (($user->memberProfile?->middle_name ?? $user->applicationProfile?->middle_name) ? ($user->memberProfile?->middle_name ?? $user->applicationProfile?->middle_name) . ' ' : '') . ($user->memberProfile?->last_name ?? $user->applicationProfile?->last_name ?? ''));
        $subjectName = trim($subjectName) !== '' ? trim($subjectName) : (string) $user->name;

        return response()->json([
            'token' => IdentityQrToken::issue($user),
            'subject_type' => $subjectType,
            'subject_name' => $subjectName,
            'member_number' => $user->memberProfile?->member_number,
            'email' => $user->memberProfile?->email ?? $user->applicationProfile?->email ?? $user->email,
        ]);
    }
}
