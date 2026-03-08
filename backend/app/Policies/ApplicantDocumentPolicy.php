<?php

namespace App\Policies;

use App\Models\ApplicantDocument;
use App\Models\User;

class ApplicantDocumentPolicy
{
    public function view(User $user, ApplicantDocument $document): bool
    {
        $applicant = $document->applicant;

        $isOwner = $applicant
            && (
                $applicant->user_id === $user->id
                || strtolower(trim((string) $applicant->email)) === strtolower(trim((string) $user->email))
            );

        if ($isOwner) {
            return true;
        }

        return $user->hasPermission('applications.docs.view')
            || $user->hasPermission('applications.docs.review')
            || $user->hasPermission('applications.review');
    }

    public function review(User $user, ApplicantDocument $document): bool
    {
        return $user->hasPermission('applications.docs.review');
    }
}
