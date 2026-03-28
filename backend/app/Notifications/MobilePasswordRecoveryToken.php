<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class MobilePasswordRecoveryToken extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $token,
        private readonly string $loginEmail
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
            ->subject('LGEC Mobile Password Recovery')
            ->line('A mobile app password recovery was requested for your LGEC account.')
            ->line('Login ID: ' . $this->loginEmail)
            ->line('Recovery Token: ' . $this->token)
            ->line('Use this token with the mobile password reset screen to set a new password.')
            ->line('If you did not request this change, contact an administrator.');
    }
}
