<?php

namespace App\Http\Controllers;

use App\Models\FormalPhoto;
use App\Models\Applicant;
use App\Models\Member;
use App\Models\User;
use App\Support\ImageUploadOptimizer;
use App\Support\BootstrapSuperadminPrivacy;
use App\Support\Permissions;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class FormalPhotoController extends Controller
{
    public function showMine(Request $request)
    {
        $user = $this->authenticatedUser($request);
        $formalPhoto = $user->formalPhoto;

        return response()->json([
            'formal_photo' => $formalPhoto?->toMetadataArray(true),
        ]);
    }

    public function storeMine(Request $request)
    {
        $user = $this->authenticatedUser($request);

        $validated = $request->validate([
            'photo' => 'required|image|mimes:jpg,jpeg,png,webp|max:10240',
            'template_key' => 'nullable|string|max:80',
        ]);

        /** @var UploadedFile $uploadedFile */
        $uploadedFile = $validated['photo'];
        $directory = sprintf('formal-photos/%d', $user->id);
        $storedPath = ImageUploadOptimizer::storeOptimizedOrOriginal(
            $uploadedFile,
            $directory,
            'local',
            1600,
            1600,
            84,
            true,
            2 * 1024 * 1024
        );

        $storedAbsolutePath = Storage::disk('local')->path($storedPath);
        $imageSize = @getimagesize($storedAbsolutePath);
        $width = is_array($imageSize) ? (int) ($imageSize[0] ?? 0) : null;
        $height = is_array($imageSize) ? (int) ($imageSize[1] ?? 0) : null;
        $mimeType = Storage::disk('local')->mimeType($storedPath) ?: $uploadedFile->getMimeType();
        $fileSize = Storage::disk('local')->size($storedPath);

        $existing = $user->formalPhoto()->first();
        $oldDisk = $existing?->disk ?: 'local';
        $oldPath = $existing?->file_path;

        try {
            $formalPhoto = DB::transaction(function () use ($existing, $user, $storedPath, $mimeType, $fileSize, $width, $height, $validated) {
                $attributes = [
                    'disk' => 'local',
                    'file_path' => $storedPath,
                    'mime_type' => $mimeType,
                    'file_size' => is_numeric($fileSize) ? (int) $fileSize : null,
                    'width' => $width,
                    'height' => $height,
                    'template_key' => isset($validated['template_key']) && trim((string) $validated['template_key']) !== ''
                        ? trim((string) $validated['template_key'])
                        : null,
                ];

                if ($existing) {
                    $existing->fill($attributes);
                    $existing->save();

                    return $existing->fresh();
                }

                return FormalPhoto::query()->create([
                    'user_id' => $user->id,
                    ...$attributes,
                ]);
            });
        } catch (\Throwable $e) {
            if (Storage::disk('local')->exists($storedPath)) {
                Storage::disk('local')->delete($storedPath);
            }

            throw $e;
        }

        if ($oldPath && $oldPath !== $storedPath && Storage::disk($oldDisk)->exists($oldPath)) {
            Storage::disk($oldDisk)->delete($oldPath);
        }

        return response()->json([
            'message' => 'Formal photo saved.',
            'formal_photo' => $formalPhoto->toMetadataArray(true),
        ], $existing ? 200 : 201);
    }

    public function showMineImage(Request $request)
    {
        $user = $this->authenticatedUser($request);
        $formalPhoto = $user->formalPhoto;

        if (!$formalPhoto) {
            abort(404, 'Formal photo file not found.');
        }

        return $this->streamPhoto($formalPhoto);
    }

    public function showImage(Request $request, FormalPhoto $formalPhoto)
    {
        $this->authorize('view', $formalPhoto);

        return $this->streamPhoto($formalPhoto);
    }

    public function showForMember(Request $request, Member $member)
    {
        $this->ensurePortalPermission($request, Permissions::FORMAL_PHOTOS_VIEW_PRIVATE);
        $viewer = $request->user();

        if (
            BootstrapSuperadminPrivacy::isBootstrapEmail($member->email)
            && BootstrapSuperadminPrivacy::shouldFilterBootstrapEmail($viewer)
        ) {
            abort(404);
        }

        $user = $this->resolveMemberUser($member);
        if (!$user) {
            return response()->json(['message' => 'No linked portal user found for this member.'], 404);
        }

        return response()->json([
            'member_id' => $member->id,
            'user_id' => $user->id,
            'member' => [
                'id' => $member->id,
                'subject_key' => 'member:' . $member->id,
                'subject_type' => 'member',
                'identifier' => $member->member_number,
                'full_name' => trim(implode(' ', array_filter([
                    $member->first_name,
                    $member->middle_name,
                    $member->last_name,
                ]))),
                'email' => BootstrapSuperadminPrivacy::maskEmailForViewer($viewer, $member->email),
                'subtitle' => 'Member',
                'lookup_url' => route('formal-photos.members.show', ['member' => $member->id], false),
            ],
            'formal_photo' => $user->formalPhoto?->toMetadataArray(),
        ]);
    }

    public function showForApplicant(Request $request, Applicant $applicant)
    {
        $this->ensurePortalPermission($request, Permissions::FORMAL_PHOTOS_VIEW_PRIVATE);

        $user = $applicant->user()->first();
        if (!$user) {
            return response()->json(['message' => 'No linked portal user found for this applicant.'], 404);
        }

        return response()->json([
            'applicant_id' => $applicant->id,
            'user_id' => $user->id,
            'applicant' => [
                'id' => $applicant->id,
                'subject_key' => 'applicant:' . $applicant->id,
                'subject_type' => 'applicant',
                'identifier' => strtoupper(str_replace('_', ' ', (string) $applicant->status)),
                'full_name' => trim(implode(' ', array_filter([
                    $applicant->first_name,
                    $applicant->middle_name,
                    $applicant->last_name,
                ]))),
                'email' => $applicant->email,
                'subtitle' => 'Applicant',
                'lookup_url' => route('formal-photos.applicants.show', ['applicant' => $applicant->id], false),
            ],
            'formal_photo' => $user->formalPhoto?->toMetadataArray(),
        ]);
    }

    public function indexDirectory(Request $request)
    {
        $this->ensurePortalPermission($request, Permissions::FORMAL_PHOTOS_VIEW_PRIVATE);
        $viewer = $request->user();

        $search = trim((string) $request->query('search', ''));
        $members = Member::query()
            ->whereNotNull('user_id')
            ->with('user.formalPhoto');

        if (BootstrapSuperadminPrivacy::shouldFilterBootstrapEmail($viewer)) {
            $members->whereRaw('LOWER(TRIM(COALESCE(email, ""))) <> ?', [BootstrapSuperadminPrivacy::bootstrapEmail()]);
        }

        if ($search !== '') {
            $members->where(function ($builder) use ($search): void {
                $builder->where('member_number', 'like', "%{$search}%")
                    ->orWhere('first_name', 'like', "%{$search}%")
                    ->orWhere('middle_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $memberRows = $members
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->limit(15)
            ->get()
            ->map(function (Member $member) use ($viewer) {
                $formalPhoto = $member->user?->formalPhoto;

                return [
                    'id' => $member->id,
                    'subject_type' => 'member',
                    'subject_key' => 'member:' . $member->id,
                    'identifier' => $member->member_number,
                    'full_name' => trim(implode(' ', array_filter([
                        $member->first_name,
                        $member->middle_name,
                        $member->last_name,
                    ]))),
                    'email' => BootstrapSuperadminPrivacy::maskEmailForViewer($viewer, $member->email),
                    'subtitle' => 'Member',
                    'lookup_url' => route('formal-photos.members.show', ['member' => $member->id], false),
                    'formal_photo' => $formalPhoto?->toMetadataArray(),
                    'has_formal_photo' => $formalPhoto !== null,
                ];
            });

        $applicants = Applicant::query()
            ->whereNotNull('user_id')
            ->with('user.formalPhoto');

        if ($search !== '') {
            $applicants->where(function ($builder) use ($search): void {
                $builder->where('first_name', 'like', "%{$search}%")
                    ->orWhere('middle_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('status', 'like', "%{$search}%")
                    ->orWhere('decision_status', 'like', "%{$search}%");
            });
        }

        $applicantRows = $applicants
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->limit(15)
            ->get()
            ->map(function (Applicant $applicant) {
                $formalPhoto = $applicant->user?->formalPhoto;

                return [
                    'id' => $applicant->id,
                    'subject_type' => 'applicant',
                    'subject_key' => 'applicant:' . $applicant->id,
                    'identifier' => strtoupper(str_replace('_', ' ', (string) $applicant->status)),
                    'full_name' => trim(implode(' ', array_filter([
                        $applicant->first_name,
                        $applicant->middle_name,
                        $applicant->last_name,
                    ]))),
                    'email' => $applicant->email,
                    'subtitle' => 'Applicant',
                    'lookup_url' => route('formal-photos.applicants.show', ['applicant' => $applicant->id], false),
                    'formal_photo' => $formalPhoto?->toMetadataArray(),
                    'has_formal_photo' => $formalPhoto !== null,
                ];
            });

        $results = $memberRows
            ->concat($applicantRows)
            ->sortBy(fn (array $row) => strtolower($row['full_name'] . '|' . $row['subject_type']))
            ->values()
            ->all();

        return response()->json(['data' => $results]);
    }

    private function streamPhoto(FormalPhoto $formalPhoto)
    {
        $disk = $formalPhoto->disk ?: 'local';

        if (!$formalPhoto->file_path || !Storage::disk($disk)->exists($formalPhoto->file_path)) {
            abort(404, 'Formal photo file not found.');
        }

        return Storage::disk($disk)->response(
            $formalPhoto->file_path,
            basename((string) $formalPhoto->file_path)
        );
    }

    private function resolveMemberUser(Member $member): ?User
    {
        return $member->user_id ? $member->user()->first() : null;
    }
}
