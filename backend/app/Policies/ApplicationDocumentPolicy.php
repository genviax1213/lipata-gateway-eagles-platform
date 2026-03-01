<?php

namespace App\Policies;

use App\Models\ApplicationDocument;
use App\Models\User;

class ApplicationDocumentPolicy
{
    public function view(User $user, ApplicationDocument $document): bool
    {
        $application = $document->application;

        $isOwner = $application
            && (
                $application->user_id === $user->id
                || strtolower(trim((string) $application->email)) === strtolower(trim((string) $user->email))
            );

        if ($isOwner) {
            return true;
        }

        return $user->hasPermission('applications.docs.review')
            || $user->hasPermission('members.view');
    }

    public function review(User $user, ApplicationDocument $document): bool
    {
        return (string) optional($user->role)->name === 'membership_chairman';
    }
}
