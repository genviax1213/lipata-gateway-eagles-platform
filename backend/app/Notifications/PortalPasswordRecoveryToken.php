<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PortalPasswordRecoveryToken extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $token,
        private readonly string $loginAlias
    ) {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function token(): string
    {
        return $this->token;
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('LGEC Portal Password Recovery')
            ->line('A portal password recovery was requested for your LGEC account.')
            ->line('Login Alias: ' . $this->loginAlias)
            ->line('Recovery Token: ' . $this->token)
            ->line('Use this token on the portal password reset screen to set a new password.')
            ->line('If you did not request this, please contact an administrator.');
    }
}

