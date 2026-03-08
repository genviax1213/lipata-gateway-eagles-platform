<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class BootstrapRecoveryToken extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $token,
        private readonly string $email
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
            ->subject('Bootstrap Recovery Token')
            ->line('A bootstrap account password recovery was requested.')
            ->line('Account: ' . $this->email)
            ->line('Recovery Token: ' . $this->token)
            ->line('Use this token with the protected recovery endpoint to reset the bootstrap password.')
            ->line('If you did not initiate this recovery, ignore this message and review account activity.');
    }
}
