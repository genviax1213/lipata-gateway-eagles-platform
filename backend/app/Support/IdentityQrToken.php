<?php

namespace App\Support;

use App\Models\Applicant;
use App\Models\Member;
use App\Models\User;

class IdentityQrToken
{
    public static function issue(User $user): string
    {
        $user->loadMissing('memberProfile:id,user_id,member_number,first_name,middle_name,last_name,email', 'applicationProfile:id,user_id,first_name,middle_name,last_name,email,status');

        $payload = [
            'v' => 1,
            'uid' => $user->id,
            'role' => optional($user->role)->name,
            'member_id' => $user->memberProfile?->id,
            'applicant_id' => $user->applicationProfile?->id,
            'iat' => now()->timestamp,
        ];

        $encoded = self::base64UrlEncode(json_encode($payload, JSON_UNESCAPED_SLASHES));
        $signature = hash_hmac('sha256', $encoded, self::secret());

        return $encoded . '.' . $signature;
    }

    public static function resolve(string $token): ?array
    {
        [$encoded, $signature] = array_pad(explode('.', trim($token), 2), 2, null);
        if (!$encoded || !$signature) {
            return null;
        }

        $expected = hash_hmac('sha256', $encoded, self::secret());
        if (!hash_equals($expected, $signature)) {
            return null;
        }

        $decoded = self::base64UrlDecode($encoded);
        if ($decoded === null) {
            return null;
        }

        $payload = json_decode($decoded, true);
        if (!is_array($payload) || !isset($payload['uid'])) {
            return null;
        }

        /** @var User|null $user */
        $user = User::query()
            ->with(['role:id,name', 'memberProfile', 'applicationProfile'])
            ->find($payload['uid']);

        if (!$user) {
            return null;
        }

        /** @var Member|null $member */
        $member = $user->memberProfile;
        /** @var Applicant|null $application */
        $application = $user->applicationProfile;

        $subjectType = $member ? 'member' : ($application ? 'applicant' : 'user');
        $subjectName = trim(($member?->first_name ?? $application?->first_name ?? $user->name) . ' ' . (($member?->middle_name ?? $application?->middle_name) ? ($member?->middle_name ?? $application?->middle_name) . ' ' : '') . ($member?->last_name ?? $application?->last_name ?? ''));
        $subjectName = trim($subjectName) !== '' ? trim($subjectName) : (string) $user->name;

        return [
            'user' => $user,
            'member' => $member,
            'applicant' => $application,
            'subject_type' => $subjectType,
            'subject_name' => $subjectName,
            'member_number' => $member?->member_number,
            'email' => $member?->email ?? $application?->email ?? $user->email,
        ];
    }

    private static function secret(): string
    {
        return (string) config('app.key');
    }

    private static function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $value): ?string
    {
        $padding = strlen($value) % 4;
        if ($padding > 0) {
            $value .= str_repeat('=', 4 - $padding);
        }

        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}
