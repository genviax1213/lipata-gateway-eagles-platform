<?php

namespace App\Http\Controllers;

use App\Models\Applicant;
use App\Models\FormalPhoto;
use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use ZipArchive;

class DirectoryExportController extends Controller
{
    public function exportMembers(Request $request)
    {
        $target = $this->normalizedTarget($request);
        $filename = sprintf('lgec_members_%s_%s.csv', now()->format('Y'), $target);

        $rows = Member::query()
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get([
                'member_number',
                'first_name',
                'middle_name',
                'last_name',
                'email',
                'batch',
                'contact_number',
                'address',
                'date_of_birth',
                'induction_date',
                'email_verified',
                'password_set',
            ]);

        return Response::streamDownload(function () use ($rows): void {
            $handle = fopen('php://output', 'wb');
            fputcsv($handle, ['Member Number', 'First Name', 'Middle Name', 'Last Name', 'Email', 'Batch', 'Contact Number', 'Address', 'Date Of Birth', 'Induction Date', 'Email Verified', 'Password Set']);
            foreach ($rows as $row) {
                fputcsv($handle, [
                    $row->member_number,
                    $row->first_name,
                    $row->middle_name,
                    $row->last_name,
                    $row->email,
                    $row->batch,
                    $row->contact_number,
                    $row->address,
                    optional($row->date_of_birth)?->toDateString(),
                    optional($row->induction_date)?->toDateString(),
                    $row->email_verified ? 'Yes' : 'No',
                    $row->password_set ? 'Yes' : 'No',
                ]);
            }
            fclose($handle);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function exportApplicants(Request $request)
    {
        $target = $this->normalizedTarget($request);
        $filename = sprintf('lgec_applicants_%s_%s.csv', now()->format('Y'), $target);

        $rows = Applicant::query()
            ->with('batch:id,name')
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get();

        return Response::streamDownload(function () use ($rows): void {
            $handle = fopen('php://output', 'wb');
            fputcsv($handle, ['First Name', 'Middle Name', 'Last Name', 'Email', 'Batch', 'Current Stage', 'Status', 'Decision Status', 'Email Verified At', 'Reviewed At', 'Created At']);
            foreach ($rows as $row) {
                fputcsv($handle, [
                    $row->first_name,
                    $row->middle_name,
                    $row->last_name,
                    $row->email,
                    $row->batch?->name,
                    $row->current_stage,
                    $row->status,
                    $row->decision_status,
                    optional($row->email_verified_at)?->toDateTimeString(),
                    optional($row->reviewed_at)?->toDateTimeString(),
                    optional($row->created_at)?->toDateTimeString(),
                ]);
            }
            fclose($handle);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function exportMemberPhotosZip(Request $request)
    {
        $baseLabel = trim((string) $request->query('label', ''));
        $baseLabel = $baseLabel !== '' ? Str::slug($baseLabel, '_') : sprintf('lgec_members_%s', now()->format('Y'));
        $filename = $baseLabel . '.zip';

        $photos = FormalPhoto::query()
            ->with(['user.memberProfile'])
            ->orderBy('id')
            ->get();

        $tempPath = tempnam(sys_get_temp_dir(), 'lgec-member-photos-');
        $zip = new ZipArchive();
        $zip->open($tempPath, ZipArchive::OVERWRITE);

        $added = 0;
        foreach ($photos as $photo) {
            $member = $photo->user?->memberProfile;
            if (!$member) {
                continue;
            }

            $disk = $photo->disk ?: 'local';
            if (!Storage::disk($disk)->exists($photo->file_path)) {
                continue;
            }

            $extension = pathinfo($photo->file_path, PATHINFO_EXTENSION) ?: 'webp';
            $entryName = sprintf(
                '%s_%s_%s.%s',
                Str::slug((string) $member->last_name, '_'),
                Str::slug((string) $member->first_name, '_'),
                Str::slug((string) $member->member_number, '_'),
                $extension
            );

            $zip->addFromString($entryName, Storage::disk($disk)->get($photo->file_path));
            $added++;
        }

        if ($added === 0) {
            $zip->addFromString('README.txt', "No member formal photos were available for export.\n");
        }

        $zip->close();

        return response()->download($tempPath, $filename)->deleteFileAfterSend(true);
    }

    private function normalizedTarget(Request $request): string
    {
        $target = strtolower((string) $request->query('target', 'excel'));

        return in_array($target, ['excel', 'google_sheets'], true) ? $target : 'excel';
    }
}
